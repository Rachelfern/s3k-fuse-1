import { describeRazorpayConfig } from "@/lib/payments/razorpay-config";
import { NextResponse } from "next/server";

export async function GET() {
  const config = describeRazorpayConfig();

  return NextResponse.json({
    razorpayReady: config.ready,
    config: {
      keyIdPresent: config.keyIdPresent,
      keyIdValid: config.keyIdValid,
      keySecretPresent: config.keySecretPresent,
      keySecretValid: config.keySecretValid,
    },
  });
}
