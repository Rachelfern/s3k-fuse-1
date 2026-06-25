export type SenderType = "customer" | "admin" | "system";
export type CartStatus = "active" | "converted" | "abandoned";
export type OrderStatus =
  | "new"
  | "payment_pending"
  | "confirmed"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";
export type PaymentStatus =
  | "pending"
  | "verified"
  | "failed"
  | "verification_pending"
  | "rejected"
  | "retry_submitted";
export type PaymentMethod = "upi" | "card" | "cod";
export type ShipmentStatus =
  | "awaiting_payment"
  | "assigned"
  | "packed"
  | "in_transit"
  | "delivered";
export type UserRole = "admin" | "customer";

export type AiIssueType =
  | "NORMAL"
  | "QUESTION"
  | "ORDER_ISSUE"
  | "PAYMENT_ISSUE"
  | "REFUND_REQUEST"
  | "COMPLAINT"
  | "URGENT"
  | "SUPPORT";

export type AiPriorityLevel = "critical" | "high" | "normal";

export type Business = {
  id: string;
  name: string;
  slug: string;
};

export type Product = {
  id: string;
  business_id: string | null;
  name_en: string;
  name_hi: string | null;
  description: string | null;
  category: string;
  price: number;
  stock: number;
  image_url: string | null;
  active: boolean;
  created_at: string;
};

export type DeletionStatus = "pending_deletion" | "deleted";

export type DpdpAuditEventType =
  | "consent_given"
  | "consent_withdrawn"
  | "deletion_requested"
  | "deletion_completed";

export type Customer = {
  id: string;
  business_id: string | null;
  phone: string;
  name: string | null;
  address: string | null;
  order_count: number;
  total_spent: number;
  consent_given: boolean;
  dpdp_consent: boolean;
  dpdp_consent_at: string | null;
  deletion_status: DeletionStatus | null;
  deleted_at: string | null;
  created_at: string;
};

export type DpdpAuditLog = {
  id: string;
  customer_id: string;
  event_type: DpdpAuditEventType;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Conversation = {
  id: string;
  business_id: string | null;
  customer_id: string | null;
  unread_count: number;
  last_message_at: string;
  ai_issue_type: AiIssueType;
  ai_priority_score: number;
  ai_priority_level: AiPriorityLevel;
  ai_summary: string | null;
  ai_customer_intent: string | null;
  ai_suggested_action: string | null;
  ai_suggested_reply: string | null;
  ai_insights_at: string | null;
  needs_human_assistance?: boolean;
  support_ticket_id?: string | null;
  support_ticket_created_at?: string | null;
  created_at: string;
};

export type ReturnRequestStatus =
  | "awaiting_reason"
  | "awaiting_photo"
  | "pending"
  | "approved"
  | "rejected"
  | "pickup_scheduled"
  | "picked_up"
  | "refunded";

export type ReturnRequest = {
  id: string;
  order_id: string;
  customer_id: string;
  conversation_id: string | null;
  request_type: "entire" | "partial";
  status: ReturnRequestStatus;
  reason: string | null;
  photo_url: string | null;
  customer_name: string | null;
  pickup_address: string | null;
  phone: string | null;
  pickup_reference: string | null;
  refund_reference: string | null;
  reject_reason: string | null;
  approved_at: string | null;
  pickup_scheduled_at: string | null;
  picked_up_at: string | null;
  refunded_at: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupportTicket = {
  id: string;
  conversation_id: string;
  customer_id: string;
  order_id: string | null;
  status: string;
  subject: string | null;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  conversation_id: string | null;
  sender_type: SenderType;
  content: string;
  intent: string | null;
  was_ai_drafted: boolean;
  created_at: string;
};

export type Cart = {
  id: string;
  customer_id: string | null;
  conversation_id: string | null;
  status: CartStatus;
  created_at: string;
  updated_at: string;
};

export type CartItem = {
  id: string;
  cart_id: string | null;
  product_id: string | null;
  quantity: number;
  price_snapshot: number;
};

export type Order = {
  id: string;
  business_id: string | null;
  customer_id: string | null;
  cart_id: string | null;
  status: OrderStatus;
  total_amount: number;
  delivery_fee: number;
  payment_utr: string | null;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  delivery_courier: string | null;
  tracking_id: string | null;
  shipment_status: ShipmentStatus;
  delivery_address: string | null;
  notes: string | null;
  payment_screenshot_url: string | null;
  payment_screenshot_path: string | null;
  payment_screenshot_uploaded_at: string | null;
  payment_rejection_reason: string | null;
  payment_rejected_at: string | null;
  payment_verified_at: string | null;
  payment_retry_submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Partial row returned by orders.select('total_amount') */
export type OrderRevenueRow = Pick<Order, "total_amount">;

/** Row shape for orders joined with customers in admin dashboard */
export type OrderWithCustomerRow = {
  id: string;
  total_amount: number;
  status: OrderStatus;
  created_at: string;
  customers: Pick<Customer, "name" | "phone"> | null;
};

export type InventoryAuditLog = {
  id: string;
  product_id: string;
  product_name: string;
  previous_stock: number;
  quantity_sold: number;
  new_stock: number;
  order_id: string | null;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: Business;
        Insert: {
          id?: string;
          name?: string;
          slug?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: {
          id?: string;
          business_id?: string | null;
          name_en: string;
          name_hi?: string | null;
          description?: string | null;
          category?: string;
          price: number;
          stock?: number;
          image_url?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string | null;
          name_en?: string;
          name_hi?: string | null;
          description?: string | null;
          category?: string;
          price?: number;
          stock?: number;
          image_url?: string | null;
          active?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: Customer;
        Insert: {
          id?: string;
          business_id?: string | null;
          phone: string;
          name?: string | null;
          address?: string | null;
          order_count?: number;
          total_spent?: number;
          consent_given?: boolean;
          dpdp_consent?: boolean;
          dpdp_consent_at?: string | null;
          deletion_status?: DeletionStatus | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string | null;
          phone?: string;
          name?: string | null;
          address?: string | null;
          order_count?: number;
          total_spent?: number;
          consent_given?: boolean;
          dpdp_consent?: boolean;
          dpdp_consent_at?: string | null;
          deletion_status?: DeletionStatus | null;
          deleted_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      dpdp_audit_log: {
        Row: DpdpAuditLog;
        Insert: {
          id?: string;
          customer_id: string;
          event_type: DpdpAuditEventType;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string;
          event_type?: DpdpAuditEventType;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "dpdp_audit_log_customer_id_fkey";
            columns: ["customer_id"];
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: Conversation;
        Insert: {
          id?: string;
          business_id?: string | null;
          customer_id?: string | null;
          unread_count?: number;
          last_message_at?: string;
          ai_issue_type?: AiIssueType;
          ai_priority_score?: number;
          ai_priority_level?: AiPriorityLevel;
          ai_summary?: string | null;
          ai_customer_intent?: string | null;
          ai_suggested_action?: string | null;
          ai_suggested_reply?: string | null;
          ai_insights_at?: string | null;
          needs_human_assistance?: boolean;
          support_ticket_id?: string | null;
          support_ticket_created_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string | null;
          customer_id?: string | null;
          unread_count?: number;
          last_message_at?: string;
          ai_issue_type?: AiIssueType;
          ai_priority_score?: number;
          ai_priority_level?: AiPriorityLevel;
          ai_summary?: string | null;
          ai_customer_intent?: string | null;
          ai_suggested_action?: string | null;
          ai_suggested_reply?: string | null;
          ai_insights_at?: string | null;
          needs_human_assistance?: boolean;
          support_ticket_id?: string | null;
          support_ticket_created_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_customer_id_fkey";
            columns: ["customer_id"];
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: Message;
        Insert: {
          id?: string;
          conversation_id?: string | null;
          sender_type: SenderType;
          content: string;
          intent?: string | null;
          was_ai_drafted?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string | null;
          sender_type?: SenderType;
          content?: string;
          intent?: string | null;
          was_ai_drafted?: boolean;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      carts: {
        Row: Cart;
        Insert: {
          id?: string;
          customer_id?: string | null;
          conversation_id?: string | null;
          status?: CartStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          customer_id?: string | null;
          conversation_id?: string | null;
          status?: CartStatus;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "carts_customer_id_fkey";
            columns: ["customer_id"];
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "carts_conversation_id_fkey";
            columns: ["conversation_id"];
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      cart_items: {
        Row: CartItem;
        Insert: {
          id?: string;
          cart_id?: string | null;
          product_id?: string | null;
          quantity: number;
          price_snapshot: number;
        };
        Update: {
          id?: string;
          cart_id?: string | null;
          product_id?: string | null;
          quantity?: number;
          price_snapshot?: number;
        };
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey";
            columns: ["cart_id"];
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cart_items_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: Order;
        Insert: {
          id?: string;
          business_id?: string | null;
          customer_id?: string | null;
          cart_id?: string | null;
          status?: OrderStatus;
          total_amount: number;
          delivery_fee?: number;
          payment_utr?: string | null;
          payment_status?: PaymentStatus;
          payment_method?: PaymentMethod;
          delivery_courier?: string | null;
          tracking_id?: string | null;
          shipment_status?: ShipmentStatus;
          delivery_address?: string | null;
          notes?: string | null;
          payment_screenshot_url?: string | null;
          payment_screenshot_path?: string | null;
          payment_screenshot_uploaded_at?: string | null;
          payment_rejection_reason?: string | null;
          payment_rejected_at?: string | null;
          payment_verified_at?: string | null;
          payment_retry_submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string | null;
          customer_id?: string | null;
          cart_id?: string | null;
          status?: OrderStatus;
          total_amount?: number;
          delivery_fee?: number;
          payment_utr?: string | null;
          payment_status?: PaymentStatus;
          payment_method?: PaymentMethod;
          delivery_courier?: string | null;
          tracking_id?: string | null;
          shipment_status?: ShipmentStatus;
          delivery_address?: string | null;
          notes?: string | null;
          payment_screenshot_url?: string | null;
          payment_screenshot_path?: string | null;
          payment_screenshot_uploaded_at?: string | null;
          payment_rejection_reason?: string | null;
          payment_rejected_at?: string | null;
          payment_verified_at?: string | null;
          payment_retry_submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_cart_id_fkey";
            columns: ["cart_id"];
            referencedRelation: "carts";
            referencedColumns: ["id"];
          },
        ];
      };
      inventory_audit_log: {
        Row: InventoryAuditLog;
        Insert: {
          id?: string;
          product_id: string;
          product_name: string;
          previous_stock: number;
          quantity_sold: number;
          new_stock: number;
          order_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          product_name?: string;
          previous_stock?: number;
          quantity_sold?: number;
          new_stock?: number;
          order_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_audit_log_product_id_fkey";
            columns: ["product_id"];
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "inventory_audit_log_order_id_fkey";
            columns: ["order_id"];
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      return_requests: {
        Row: ReturnRequest;
        Insert: {
          id?: string;
          order_id: string;
          customer_id: string;
          conversation_id?: string | null;
          request_type: "entire" | "partial";
          status?: ReturnRequestStatus;
          reason?: string | null;
          photo_url?: string | null;
          customer_name?: string | null;
          pickup_address?: string | null;
          phone?: string | null;
          pickup_reference?: string | null;
          refund_reference?: string | null;
          reject_reason?: string | null;
          approved_at?: string | null;
          pickup_scheduled_at?: string | null;
          picked_up_at?: string | null;
          refunded_at?: string | null;
          rejected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          customer_id?: string;
          conversation_id?: string | null;
          request_type?: "entire" | "partial";
          status?: ReturnRequestStatus;
          reason?: string | null;
          photo_url?: string | null;
          customer_name?: string | null;
          pickup_address?: string | null;
          phone?: string | null;
          pickup_reference?: string | null;
          refund_reference?: string | null;
          reject_reason?: string | null;
          approved_at?: string | null;
          pickup_scheduled_at?: string | null;
          picked_up_at?: string | null;
          refunded_at?: string | null;
          rejected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      return_request_items: {
        Row: {
          id: string;
          return_request_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
        };
        Insert: {
          id?: string;
          return_request_id: string;
          product_id?: string | null;
          product_name: string;
          quantity?: number;
        };
        Update: {
          id?: string;
          return_request_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
        };
        Relationships: [];
      };
      support_tickets: {
        Row: SupportTicket;
        Insert: {
          id?: string;
          conversation_id: string;
          customer_id: string;
          order_id?: string | null;
          status?: string;
          subject?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          customer_id?: string;
          order_id?: string | null;
          status?: string;
          subject?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      deduct_inventory_for_order: {
        Args: {
          p_order_id: string;
          p_items: { product_id: string; quantity: number }[];
        };
        Returns: undefined;
      };
    };
  };
};
