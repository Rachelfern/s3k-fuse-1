"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CommerceErrorBoundary } from "@/components/error/commerce-error-boundary";
import { SimulatedPaymentPanel } from "@/components/payment/simulated-payment-panel";
import { UpiQrPaymentPanel } from "@/components/payment/upi-qr-payment-panel";
import { UpiPaymentScreenshotStep } from "@/components/payment/upi-payment-screenshot-step";
import { PaymentSuccessScreen } from "@/components/payment/payment-success-screen";
import {
  CustomerCard,
  CustomerPrimaryButton,
  CustomerPrimaryLink,
  CustomerQuickLink,
  CustomerSectionTitle,
  CustomerShell,
} from "@/components/customer/customer-shell";
import { ProductImage } from "@/components/product/product-image";
import { useCart } from "@/hooks/use-cart";
import { useCheckout } from "@/hooks/use-checkout";
import {
  getCustomerSession,
  saveVaartaProfile,
} from "@/lib/chat/customer-storage";
import { formatCurrency } from "@/lib/format";
import { buildChatOrderSuccessUrl } from "@/lib/chat/order-success";
import {
  buildChatPaymentRetrySuccessUrl,
  buildChatPaymentSubmittedSuccessUrl,
} from "@/lib/orders/payment-retry-flow";
import { COMMERCE_ROUTES } from "@/lib/chat/quick-replies";
import { DEFAULT_DELIVERY_FEE } from "@/lib/orders/create-order";
import {
  createPaymentOrder,
  fetchRazorpayServerStatus,
  isRazorpayConfigured,
  openRazorpayCheckout,
  verifyPayment,
  type PaymentMethod,
} from "@/lib/payments/razorpay-client";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS: {
  id: PaymentMethod;
  label: string;
  description: string;
}[] = [
  {
    id: "upi",
    label: "UPI",
    description: "Pay instantly with UPI apps",
  },
  {
    id: "card",
    label: "Card",
    description: "Credit or debit card",
  },
  {
    id: "cod",
    label: "Cash on Delivery",
    description: "Pay when your order arrives",
  },
];

type PaymentPayload = {
  method: PaymentMethod;
  transactionReference?: string;
  upiId?: string;
  razorpayPaymentId?: string;
  razorpayOrderId?: string;
  razorpaySignature?: string;
  upiAwaitingVerification?: boolean;
};

type PlaceOrderResult = {
  orderId: string;
  totalAmount?: number;
  customerId?: string;
  warnings?: string[];
};

async function validateInventory(items: {
  productId: string;
  quantity: number;
}[]) {
  try {
    const response = await fetch("/api/inventory/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });

    const body = (await response.json().catch(() => null)) as {
      ok?: boolean;
      message?: string;
      error?: string;
    } | null;

    if (!response.ok) {
      throw new Error(
        body?.message ?? body?.error ?? "Some items are unavailable.",
      );
    }
  } catch (error) {
    console.error("[CHECKOUT] Inventory validation failed:", error);
    throw error;
  }
}

async function placeOrder(input: {
  customerId?: string;
  conversationId?: string;
  checkout: { name: string; phone: string; address: string };
  items: { productId: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  payment: PaymentPayload;
}): Promise<PlaceOrderResult> {
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    const body = (await response.json().catch(() => null)) as {
      orderId?: string;
      totalAmount?: number;
      customerId?: string;
      warnings?: string[];
      error?: string;
    } | null;

    if (!response.ok || !body?.orderId) {
      throw new Error(body?.error ?? "Failed to place order.");
    }

    return {
      orderId: body.orderId,
      totalAmount: body.totalAmount,
      customerId: body.customerId,
      warnings: body.warnings,
    };
  } catch (error) {
    console.error("[CHECKOUT] placeOrder failed:", error);
    throw error;
  }
}

type RetryOrderSummary = {
  id: string;
  totalAmount: number;
  subtotal: number;
  deliveryFee: number;
  rejectReason: string | null;
  previousPaymentMethod: PaymentMethod;
  suggestedPaymentMethod: PaymentMethod;
  deliveryAddress: string | null;
  customerName: string | null;
  customerPhone: string | null;
  items: {
    productId: string;
    name: string;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
  }[];
};

async function submitRetryPayment(input: {
  orderId: string;
  customerId: string;
  payment: PaymentPayload;
}): Promise<{
  totalAmount: number;
  requiresScreenshot: boolean;
}> {
  const response = await fetch(
    `/api/orders/${encodeURIComponent(input.orderId)}/payment-retry`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: input.customerId,
        payment: input.payment,
      }),
    },
  );

  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    totalAmount?: number;
    requiresScreenshot?: boolean;
    error?: string;
  } | null;

  if (!response.ok || !body?.ok) {
    throw new Error(body?.error ?? "Failed to submit payment retry.");
  }

  return {
    totalAmount: body.totalAmount ?? 0,
    requiresScreenshot: body.requiresScreenshot ?? false,
  };
}

function PaymentPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const retryOrderId = searchParams.get("orderId")?.trim() ?? "";
  const isRetryMode = searchParams.get("retry") === "1" && retryOrderId.length > 0;
  const { snapshot, clearCart } = useCart();
  const { checkoutDetails, resetCheckout } = useCheckout();
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [paying, setPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [razorpayServerReady, setRazorpayServerReady] = useState(false);
  const [showDemoPayment, setShowDemoPayment] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<{
    orderId: string;
    totalAmount: number;
    variant: "payment" | "order";
    chatHref?: string;
  } | null>(null);
  const [upiPostPayment, setUpiPostPayment] = useState<{
    orderId: string;
    totalAmount: number;
    customerId: string;
  } | null>(null);
  const [screenshotUploading, setScreenshotUploading] = useState(false);
  const [screenshotUploaded, setScreenshotUploaded] = useState(false);
  const [upiOrderReference, setUpiOrderReference] = useState(
    () => Date.now().toString(36).toUpperCase(),
  );
  const [retryOrder, setRetryOrder] = useState<RetryOrderSummary | null>(null);
  const [retryLoading, setRetryLoading] = useState(isRetryMode);
  const [retryError, setRetryError] = useState<string | null>(null);

  const isEmpty = snapshot.itemCount === 0;
  const hasCheckoutDetails =
    checkoutDetails.name.trim() &&
    checkoutDetails.phone.trim() &&
    checkoutDetails.address.trim();
  const orderTotal = isRetryMode && retryOrder
    ? retryOrder.totalAmount
    : snapshot.subtotal + DEFAULT_DELIVERY_FEE;
  const razorpayClientConfigured = isRazorpayConfigured();
  const razorpayEnabled = razorpayClientConfigured && razorpayServerReady;
  const useUpiQrFlow = method === "upi";
  const isDemoCardPayment = method === "card" && !razorpayEnabled;
  const isDemoOnlinePayment = isDemoCardPayment;

  useEffect(() => {
    void fetchRazorpayServerStatus()
      .then((status) => {
        setRazorpayServerReady(status.razorpayReady);
        console.log("[CHECKOUT] Razorpay server status", status);
      })
      .catch((error) => {
        console.warn("[CHECKOUT] Failed to load Razorpay status:", error);
        setRazorpayServerReady(false);
      });
  }, []);

  useEffect(() => {
    setShowDemoPayment(false);
    setPaymentError(null);
    if (method === "upi") {
      setUpiOrderReference(Date.now().toString(36).toUpperCase());
    }
  }, [method]);

  useEffect(() => {
    if (!isRetryMode) return;

    const customerId = getCustomerSession().customerId;
    if (!customerId) {
      setRetryError("Please sign in from chat before retrying payment.");
      setRetryLoading(false);
      return;
    }

    const sessionCustomerId = customerId;

    let cancelled = false;

    async function loadRetryOrder() {
      setRetryLoading(true);
      setRetryError(null);

      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(retryOrderId)}/payment-retry?customerId=${encodeURIComponent(sessionCustomerId)}`,
          { cache: "no-store" },
        );

        const body = (await response.json().catch(() => null)) as {
          order?: RetryOrderSummary;
          error?: string;
        } | null;

        if (!response.ok || !body?.order) {
          throw new Error(body?.error ?? "Unable to load order for payment retry.");
        }

        if (!cancelled) {
          setRetryOrder(body.order);
          setMethod(body.order.suggestedPaymentMethod);
          setUpiOrderReference(body.order.id);
        }
      } catch (error) {
        if (!cancelled) {
          setRetryError(
            error instanceof Error ? error.message : "Unable to load order for retry.",
          );
          setRetryOrder(null);
        }
      } finally {
        if (!cancelled) {
          setRetryLoading(false);
        }
      }
    }

    void loadRetryOrder();

    return () => {
      cancelled = true;
    };
  }, [isRetryMode, retryOrderId]);

  useEffect(() => {
    if (orderSuccess || upiPostPayment || isRetryMode) return;

    if (isEmpty && !hasCheckoutDetails) return;
    if (isEmpty && hasCheckoutDetails) {
      router.replace("/cart");
      return;
    }
    if (!hasCheckoutDetails) {
      router.replace("/checkout");
    }
  }, [isEmpty, hasCheckoutDetails, router, orderSuccess, upiPostPayment, isRetryMode]);

  useEffect(() => {
    if (!screenshotUploading) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [screenshotUploading]);

  useEffect(() => {
    if (!screenshotUploaded || !upiPostPayment) return;

    const chatHref = isRetryMode
      ? buildChatPaymentRetrySuccessUrl(
          upiPostPayment.orderId,
          upiPostPayment.totalAmount,
          "upi",
        )
      : buildChatPaymentSubmittedSuccessUrl(
          upiPostPayment.orderId,
          upiPostPayment.totalAmount,
        );
    const timer = window.setTimeout(() => {
      router.push(chatHref);
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [screenshotUploaded, upiPostPayment, router, isRetryMode]);

  function completeCheckoutLocally(input: {
    orderId: string;
    totalAmount: number;
    customerId?: string;
    paymentPayload: PaymentPayload;
    warnings?: string[];
  }) {
    try {
      saveVaartaProfile({
        address: checkoutDetails.address.trim(),
        customerId: input.customerId,
      });
    } catch (error) {
      console.warn("[CHECKOUT] saveVaartaProfile failed:", error);
    }

    try {
      clearCart();
      resetCheckout();
    } catch (error) {
      console.warn("[CHECKOUT] clearCart/resetCheckout failed:", error);
    }

    if (input.warnings && input.warnings.length > 0) {
      console.warn("[CHECKOUT] Order created with post-processing warnings", {
        orderId: input.orderId,
        warnings: input.warnings,
      });
      router.push(`/orders/${input.orderId}?notice=post-processing`);
      return;
    }

    if (
      input.paymentPayload.upiAwaitingVerification &&
      input.customerId
    ) {
      setUpiPostPayment({
        orderId: input.orderId,
        totalAmount: input.totalAmount,
        customerId: input.customerId,
      });
      return;
    }

    setOrderSuccess({
      orderId: input.orderId,
      totalAmount: input.totalAmount,
      variant:
        input.paymentPayload.method === "cod" ? "order" : "payment",
    });
  }

  async function finalizeOrder(paymentPayload: PaymentPayload) {
    const session = getCustomerSession();
    const orderItems = snapshot.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.product.price,
    }));

    try {
      await validateInventory(
        orderItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
      );
    } catch (error) {
      console.error("[CHECKOUT] Step failed: validateInventory", error);
      throw error;
    }

    let result: PlaceOrderResult;
    try {
      result = await placeOrder({
        customerId: session.customerId,
        conversationId: session.conversationId,
        checkout: checkoutDetails,
        items: orderItems,
        subtotal: snapshot.subtotal,
        payment: paymentPayload,
      });
    } catch (error) {
      console.error("[CHECKOUT] Step failed: placeOrder", error);
      throw error;
    }

    console.log("[CHECKOUT] Order placement succeeded", {
      paymentMethod: paymentPayload.method,
      orderId: result.orderId,
      warnings: result.warnings,
    });

    if (!result.orderId) {
      throw new Error("Failed to place order.");
    }

    try {
      completeCheckoutLocally({
        orderId: result.orderId,
        totalAmount: result.totalAmount ?? orderTotal,
        customerId: result.customerId ?? session.customerId,
        paymentPayload,
        warnings: result.warnings,
      });
    } catch (error) {
      console.error("[CHECKOUT] Step failed: completeCheckoutLocally", error);
      router.push(`/orders/${result.orderId}?notice=post-processing`);
    }
  }

  async function handleRetryPaymentSubmit(
    paymentPayload: PaymentPayload,
    options?: { managePayingState?: boolean },
  ) {
    if (!retryOrder || paying) return;

    const customerId = getCustomerSession().customerId;
    if (!customerId) {
      setPaymentError("Please sign in from chat before retrying payment.");
      return;
    }

    const managePaying = options?.managePayingState !== false;
    if (managePaying) {
      setPaying(true);
    }
    setPaymentError(null);

    try {
      const result = await submitRetryPayment({
        orderId: retryOrder.id,
        customerId,
        payment: paymentPayload,
      });

      if (result.requiresScreenshot) {
        setUpiPostPayment({
          orderId: retryOrder.id,
          totalAmount: result.totalAmount || retryOrder.totalAmount,
          customerId,
        });
        return;
      }

      setOrderSuccess({
        orderId: retryOrder.id,
        totalAmount: result.totalAmount || retryOrder.totalAmount,
        variant: paymentPayload.method === "cod" ? "order" : "payment",
        chatHref:
          paymentPayload.method === "upi"
            ? buildChatPaymentRetrySuccessUrl(
                retryOrder.id,
                result.totalAmount || retryOrder.totalAmount,
                "upi",
              )
            : buildChatPaymentRetrySuccessUrl(
                retryOrder.id,
                result.totalAmount || retryOrder.totalAmount,
                paymentPayload.method,
              ),
      });
    } catch (error) {
      setPaymentError(
        error instanceof Error ? error.message : "Failed to submit payment retry.",
      );
    } finally {
      if (managePaying) {
        setPaying(false);
      }
    }
  }

  async function handleRetryUpiPaid() {
    if (!retryOrder) return;
    await handleRetryPaymentSubmit({
      method: "upi",
      upiAwaitingVerification: true,
      transactionReference: `UPI-PENDING-${retryOrder.id}`,
    });
  }

  async function handleRetryPrimaryAction() {
    if (!retryOrder || paying || orderSuccess) return;

    setPaymentError(null);

    if (method === "cod") {
      await handleRetryPaymentSubmit({ method: "cod" });
      return;
    }

    if (isDemoOnlinePayment) {
      setShowDemoPayment(true);
      return;
    }

    setPaying(true);

    try {
      const paymentPayload = await collectOnlinePayment();
      await handleRetryPaymentSubmit(paymentPayload, { managePayingState: false });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment failed. Try again.";
      setPaymentError(message);
    } finally {
      setPaying(false);
    }
  }

  async function handleRetryDemoPaymentSuccess(input: {
    transactionReference: string;
    upiId?: string;
  }) {
    if (paying || orderSuccess || !retryOrder) return;

    await handleRetryPaymentSubmit({
      method,
      transactionReference: input.transactionReference,
      upiId: input.upiId,
    });
    setShowDemoPayment(false);
  }

  async function handleUpiPaid() {
    if (paying || orderSuccess) return;

    setPaying(true);
    setPaymentError(null);

    try {
      console.log("[CHECKOUT] UPI manual payment claimed", {
        orderReference: upiOrderReference,
        orderTotal,
      });

      await finalizeOrder({
        method: "upi",
        upiAwaitingVerification: true,
        transactionReference: `UPI-PENDING-${upiOrderReference}`,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to place order.";
      console.error("[CHECKOUT] UPI order creation failed:", error);
      setPaymentError(message);
    } finally {
      setPaying(false);
    }
  }

  async function collectOnlinePayment(): Promise<PaymentPayload> {
    if (method === "cod") {
      throw new Error("Online payment is not available for Cash on Delivery.");
    }

    const amountPaise = Math.round(orderTotal * 100);

    if (razorpayEnabled) {
      try {
        console.log("[CHECKOUT] Creating Razorpay order", { amountPaise });

        const { orderId: razorpayOrderId } = await createPaymentOrder({
          amountPaise,
          receipt: `s3k-${Date.now().toString(36)}`,
        });

        console.log("[CHECKOUT] Opening Razorpay checkout", { razorpayOrderId });

        const razorpayResult = await openRazorpayCheckout({
          amountPaise,
          customerName: checkoutDetails.name.trim(),
          customerPhone: checkoutDetails.phone.trim(),
          description: `${snapshot.itemCount} item order`,
          razorpayOrderId,
        });

        await verifyPayment(razorpayResult);
        console.log("[CHECKOUT] Razorpay payment verified");

        return {
          method,
          razorpayPaymentId: razorpayResult.razorpay_payment_id,
          razorpayOrderId: razorpayResult.razorpay_order_id,
          razorpaySignature: razorpayResult.razorpay_signature,
          transactionReference: razorpayResult.razorpay_payment_id,
        };
      } catch (error) {
        console.error("[CHECKOUT] Step failed: collectOnlinePayment", error);
        throw error;
      }
    }

    throw new Error("Use the simulated payment panel to complete demo checkout.");
  }

  async function handlePrimaryAction() {
    if (paying || isEmpty || !hasCheckoutDetails || orderSuccess) return;

    setPaymentError(null);

    if (isDemoOnlinePayment) {
      setShowDemoPayment(true);
      return;
    }

    setPaying(true);

    try {
      console.log("[CHECKOUT] Payment attempt started", {
        paymentMethod: method,
        orderTotal,
        razorpayEnabled,
        isDemoOnlinePayment,
      });

      const paymentPayload =
        method === "cod"
          ? ({ method: "cod" } satisfies PaymentPayload)
          : await collectOnlinePayment();

      await finalizeOrder(paymentPayload);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment failed. Try again.";
      console.error("[CHECKOUT] Payment failed:", error);
      setPaymentError(message);
    } finally {
      setPaying(false);
    }
  }

  async function handleDemoPaymentSuccess(input: {
    transactionReference: string;
    upiId?: string;
  }) {
    if (method === "cod" || paying || orderSuccess) return;

    setPaying(true);
    setPaymentError(null);

    try {
      console.log("[CHECKOUT] Simulated payment success", {
        paymentMethod: method,
        transactionReference: input.transactionReference,
      });

      await finalizeOrder({
        method,
        transactionReference: input.transactionReference,
        upiId: input.upiId,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Payment failed. Try again.";
      console.error("[CHECKOUT] Simulated payment order failed:", error);
      setPaymentError(message);
    } finally {
      setPaying(false);
      setShowDemoPayment(false);
    }
  }

  function handleDemoPaymentFailure() {
    console.log("[CHECKOUT] Simulated payment failure", { paymentMethod: method });
    setPaymentError("Simulated payment failed. No order was created.");
    setShowDemoPayment(false);
  }

  if (orderSuccess) {
    return (
      <PaymentSuccessScreen
        orderId={orderSuccess.orderId}
        totalAmount={orderSuccess.totalAmount}
        variant={orderSuccess.variant}
        chatHref={orderSuccess.chatHref}
      />
    );
  }

  if (isRetryMode) {
    const customerId = getCustomerSession().customerId;

    if (upiPostPayment) {
      const chatHref = buildChatPaymentRetrySuccessUrl(
        upiPostPayment.orderId,
        upiPostPayment.totalAmount,
        "upi",
      );

      return (
        <CustomerShell
          backHref={COMMERCE_ROUTES.order(retryOrderId)}
          backLabel="Back to order"
          subtitle="Upload payment screenshot"
          navigationBlocked={screenshotUploading}
          footer={
            <CustomerPrimaryLink
              href={chatHref}
              disabled={screenshotUploading}
            >
              {screenshotUploaded ? "Return to Chat" : "Back to Chat"}
            </CustomerPrimaryLink>
          }
        >
          <div className="space-y-3">
            <UpiPaymentScreenshotStep
              orderId={upiPostPayment.orderId}
              totalAmount={upiPostPayment.totalAmount}
              customerId={upiPostPayment.customerId}
              onUploadingChange={setScreenshotUploading}
              onUploaded={() => setScreenshotUploaded(true)}
            />
            {screenshotUploaded ? (
              <p className="text-center text-xs text-gray-500">
                Returning to chat in a few seconds…
              </p>
            ) : null}
          </div>
        </CustomerShell>
      );
    }

    return (
      <CustomerShell
        backHref={COMMERCE_ROUTES.order(retryOrderId)}
        backLabel="Back to order"
        subtitle="Choose payment method"
        footer={
          useUpiQrFlow || showDemoPayment ? null : (
            <CustomerPrimaryButton
              type="button"
              onClick={() => void handleRetryPrimaryAction()}
              disabled={paying || retryLoading || !retryOrder}
            >
              {paying
                ? "Processing…"
                : method === "cod"
                  ? `Place Order · ${formatCurrency(orderTotal)}`
                  : isDemoOnlinePayment
                    ? `Continue · ${formatCurrency(orderTotal)}`
                    : `Pay Now · ${formatCurrency(orderTotal)}`}
            </CustomerPrimaryButton>
          )
        }
      >
        {retryLoading ? (
          <CustomerCard className="py-6 text-center text-sm text-gray-600">
            Loading your saved order…
          </CustomerCard>
        ) : retryError || !retryOrder ? (
          <CustomerCard className="space-y-3 py-6 text-center text-sm text-red-600">
            <p>{retryError ?? "This order is not eligible for payment retry."}</p>
            <CustomerPrimaryLink href={COMMERCE_ROUTES.chat}>
              Back to Chat
            </CustomerPrimaryLink>
          </CustomerCard>
        ) : (
          <div className="space-y-3">
            <CustomerCard>
              <CustomerSectionTitle>Payment not verified</CustomerSectionTitle>
              <p className="mt-2 text-sm text-gray-600">
                Your order and delivery details are saved. Choose how you&apos;d
                like to pay — you can switch to a different method.
              </p>
              {retryOrder.rejectReason ? (
                <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800">
                  Previous rejection: {retryOrder.rejectReason}
                </p>
              ) : null}
            </CustomerCard>

            <CustomerCard>
              <CustomerSectionTitle>Payment method</CustomerSectionTitle>
              <div className="space-y-2">
                {PAYMENT_METHODS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMethod(option.id)}
                    disabled={paying}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-[18px_18px_18px_4px] border px-3 py-3 text-left transition-colors",
                      method === option.id
                        ? "border-[var(--whatsapp-primary)] bg-[#ecfdf5]"
                        : "border-gray-200 bg-white hover:bg-gray-50",
                      option.id === retryOrder.previousPaymentMethod &&
                        method !== option.id &&
                        "opacity-100",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                        method === option.id
                          ? "border-[var(--whatsapp-primary)]"
                          : "border-gray-300",
                      )}
                    >
                      {method === option.id ? (
                        <span className="size-2 rounded-full bg-[var(--whatsapp-primary)]" />
                      ) : null}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">
                        {option.label}
                        {option.id === retryOrder.previousPaymentMethod ? (
                          <span className="ml-2 text-xs font-normal text-gray-500">
                            (previously rejected)
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {option.description}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {isDemoOnlinePayment ? (
                <p className="mt-3 text-xs text-amber-700">
                  Demo mode — card checkout uses Simulate Success or Simulate
                  Failure.
                </p>
              ) : null}
              {razorpayEnabled && method === "card" ? (
                <p className="mt-3 text-xs text-gray-500">
                  Razorpay checkout will open so you can complete card payment.
                </p>
              ) : null}
              {useUpiQrFlow ? (
                <div className="mt-4">
                  <UpiQrPaymentPanel
                    amount={retryOrder.totalAmount}
                    orderReference={retryOrder.id}
                    paying={paying}
                    onConfirmPaid={() => void handleRetryUpiPaid()}
                  />
                </div>
              ) : null}
              {paymentError ? (
                <p className="mt-3 text-sm text-red-600">{paymentError}</p>
              ) : null}
            </CustomerCard>

            {showDemoPayment && method === "card" ? (
              <SimulatedPaymentPanel
                method={method}
                amount={orderTotal}
                paying={paying}
                onSuccess={(input) => void handleRetryDemoPaymentSuccess(input)}
                onFailure={() => {
                  setShowDemoPayment(false);
                  setPaymentError("Simulated payment failed.");
                }}
                onCancel={() => {
                  setShowDemoPayment(false);
                  setPaymentError(null);
                }}
              />
            ) : null}

            <CustomerCard>
              <CustomerSectionTitle>Saved order</CustomerSectionTitle>
              {retryOrder.customerName || retryOrder.deliveryAddress ? (
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  {retryOrder.customerName ? (
                    <p>
                      <span className="font-medium text-gray-900">
                        {retryOrder.customerName}
                      </span>
                      {retryOrder.customerPhone
                        ? ` · ${retryOrder.customerPhone}`
                        : null}
                    </p>
                  ) : null}
                  {retryOrder.deliveryAddress ? (
                    <p>{retryOrder.deliveryAddress}</p>
                  ) : null}
                </div>
              ) : null}
              <ul className="mt-3 space-y-2 text-sm">
                {retryOrder.items.map((item) => (
                  <li key={item.productId} className="flex items-center gap-3">
                    <ProductImage
                      productId={item.productId}
                      name={item.name}
                      imageUrl={item.imageUrl}
                      size="xs"
                    />
                    <span className="min-w-0 flex-1 text-gray-900">
                      {item.name} ×{item.quantity}
                    </span>
                    <span className="shrink-0 font-medium text-[var(--whatsapp-accent)]">
                      {formatCurrency(item.unitPrice * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
                <div className="flex justify-between text-gray-600">
                  <span>Subtotal</span>
                  <span>{formatCurrency(retryOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Delivery</span>
                  <span>{formatCurrency(retryOrder.deliveryFee)}</span>
                </div>
                <div className="flex justify-between font-semibold text-gray-900">
                  <span>Total</span>
                  <span className="text-[var(--whatsapp-accent)]">
                    {formatCurrency(retryOrder.totalAmount)}
                  </span>
                </div>
              </div>
            </CustomerCard>
          </div>
        )}
      </CustomerShell>
    );
  }

  if (upiPostPayment) {
    const chatHref = isRetryMode
      ? buildChatPaymentRetrySuccessUrl(
          upiPostPayment.orderId,
          upiPostPayment.totalAmount,
          "upi",
        )
      : buildChatPaymentSubmittedSuccessUrl(
          upiPostPayment.orderId,
          upiPostPayment.totalAmount,
        );

    return (
      <CustomerShell
        backHref="/chat"
        backLabel="Back to chat"
        subtitle="Upload payment screenshot"
        navigationBlocked={screenshotUploading}
        quickActions={
          <CustomerQuickLink href="/chat" disabled={screenshotUploading}>
            ← Back to Chat
          </CustomerQuickLink>
        }
        footer={
          <CustomerPrimaryLink
            href={chatHref}
            disabled={screenshotUploading}
          >
            {screenshotUploaded ? "Return to Chat" : "Back to Chat"}
          </CustomerPrimaryLink>
        }
      >
        <div className="space-y-3">
          <UpiPaymentScreenshotStep
            orderId={upiPostPayment.orderId}
            totalAmount={upiPostPayment.totalAmount}
            customerId={upiPostPayment.customerId}
            onUploadingChange={setScreenshotUploading}
            onUploaded={() => setScreenshotUploaded(true)}
          />
          {screenshotUploaded ? (
            <p className="text-center text-xs text-gray-500">
              Returning to chat in a few seconds…
            </p>
          ) : null}
        </div>
      </CustomerShell>
    );
  }

  if (isEmpty || !hasCheckoutDetails) {
    return (
      <CustomerShell
        backHref="/chat"
        backLabel="Back to chat"
        subtitle="Payment"
        footer={
          <CustomerPrimaryLink href="/chat">← Back to Chat</CustomerPrimaryLink>
        }
      >
        <CustomerCard className="py-6 text-center text-sm text-gray-600">
          {paying ? "Finalizing your order…" : "Loading checkout…"}
        </CustomerCard>
      </CustomerShell>
    );
  }

  return (
    <CustomerShell
      backHref="/checkout"
      backLabel="Back to checkout"
      subtitle="Payment"
      quickActions={
        <>
          <CustomerQuickLink href="/chat">← Back to Chat</CustomerQuickLink>
          <CustomerQuickLink href="/cart">🛒 View Cart</CustomerQuickLink>
        </>
      }
      footer={
        useUpiQrFlow || showDemoPayment ? null : (
          <CustomerPrimaryButton
            type="button"
            onClick={() => void handlePrimaryAction()}
            disabled={paying}
          >
            {paying
              ? "Processing…"
              : method === "cod"
                ? `Place Order · ${formatCurrency(orderTotal)}`
                : isDemoOnlinePayment
                  ? `Continue · ${formatCurrency(orderTotal)}`
                  : `Pay Now · ${formatCurrency(orderTotal)}`}
          </CustomerPrimaryButton>
        )
      }
    >
      <div className="space-y-3">
        <CustomerCard>
          <CustomerSectionTitle>Payment method</CustomerSectionTitle>
          <div className="space-y-2">
            {PAYMENT_METHODS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setMethod(option.id)}
                disabled={paying}
                className={cn(
                  "flex w-full items-start gap-3 rounded-[18px_18px_18px_4px] border px-3 py-3 text-left transition-colors",
                  method === option.id
                    ? "border-[var(--whatsapp-primary)] bg-[#ecfdf5]"
                    : "border-gray-200 bg-white hover:bg-gray-50",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                    method === option.id
                      ? "border-[var(--whatsapp-primary)]"
                      : "border-gray-300",
                  )}
                >
                  {method === option.id ? (
                    <span className="size-2 rounded-full bg-[var(--whatsapp-primary)]" />
                  ) : null}
                </span>
                <span>
                  <span className="block text-sm font-semibold text-gray-900">
                    {option.label}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {option.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
          {isDemoOnlinePayment ? (
            <p className="mt-3 text-xs text-amber-700">
              Demo mode — card checkout uses Simulate Success or Simulate Failure
              before any order is created.
            </p>
          ) : null}
          {razorpayEnabled && method === "card" ? (
            <p className="mt-3 text-xs text-gray-500">
              Razorpay checkout will open so you can complete card payment.
            </p>
          ) : null}
          {useUpiQrFlow ? (
            <div className="mt-4">
              <UpiQrPaymentPanel
                amount={orderTotal}
                orderReference={upiOrderReference}
                paying={paying}
                onConfirmPaid={() => void handleUpiPaid()}
              />
            </div>
          ) : null}
          {paymentError ? (
            <p className="mt-3 text-sm text-red-600">{paymentError}</p>
          ) : null}
        </CustomerCard>

        {showDemoPayment && method === "card" ? (
          <SimulatedPaymentPanel
            method={method}
            amount={orderTotal}
            paying={paying}
            onSuccess={(input) => void handleDemoPaymentSuccess(input)}
            onFailure={handleDemoPaymentFailure}
            onCancel={() => {
              setShowDemoPayment(false);
              setPaymentError(null);
            }}
          />
        ) : null}

        <CustomerCard>
          <CustomerSectionTitle>Order summary</CustomerSectionTitle>
          <ul className="space-y-2 text-sm">
            {snapshot.items.map((item) => (
              <li key={item.productId} className="flex items-center gap-3">
                <ProductImage
                  productId={item.productId}
                  name={item.product.name}
                  imageUrl={item.product.image_url}
                  size="xs"
                />
                <span className="min-w-0 flex-1 text-gray-900">
                  {item.product.name} ×{item.quantity}
                </span>
                <span className="shrink-0 font-medium text-[var(--whatsapp-accent)]">
                  {formatCurrency(item.lineSubtotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1 border-t border-gray-100 pt-3 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(snapshot.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery</span>
              <span>{formatCurrency(DEFAULT_DELIVERY_FEE)}</span>
            </div>
            <div className="flex justify-between font-semibold text-gray-900">
              <span>Total</span>
              <span className="text-[var(--whatsapp-accent)]">
                {formatCurrency(orderTotal)}
              </span>
            </div>
          </div>
        </CustomerCard>
      </div>
    </CustomerShell>
  );
}

function PaymentPageFallback() {
  return (
    <CustomerShell
      backHref="/checkout"
      backLabel="Back to checkout"
      subtitle="Payment"
    >
      <CustomerCard className="py-6 text-center text-sm text-gray-600">
        Loading…
      </CustomerCard>
    </CustomerShell>
  );
}

export default function PaymentPage() {
  return (
    <CommerceErrorBoundary pageTitle="Payment" backHref="/checkout">
      <Suspense fallback={<PaymentPageFallback />}>
        <PaymentPageContent />
      </Suspense>
    </CommerceErrorBoundary>
  );
}
