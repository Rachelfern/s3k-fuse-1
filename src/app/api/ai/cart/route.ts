import { parseCustomerCart } from "@/lib/ai/cart-service";
import { createServiceClient } from "@/lib/supabase/service-client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      customerId?: string;
      conversationId?: string;
    };

    const message = body.message?.trim();
    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    if (!body.customerId || !body.conversationId) {
      return NextResponse.json(
        { error: "customerId and conversationId are required" },
        { status: 400 },
      );
    }

    const supabase = createServiceClient();
    const result = await parseCustomerCart({
      supabase,
      message,
      customerId: body.customerId,
      conversationId: body.conversationId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ERROR] AI cart failed:", error);
    return NextResponse.json({ error: "Failed to parse cart" }, { status: 500 });
  }
}
