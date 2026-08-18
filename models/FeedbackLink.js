// models/FeedbackLink.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "feedback_links";

const norm = (row, customer = null) => {
  if (!row) return null;
  const record = {
    ...row,
    _id:        row.id,
    customerId: customer || row.customer_id,
    expiresAt:  row.expires_at,
    createdAt:  row.created_at,
    sentVia: {
      email:     row.sent_via_email     || false,
      sms:       row.sent_via_sms       || false,
      whatsapp:  row.sent_via_whatsapp  || false,
    },
    isExpired() {
      if (this.status === "EXPIRED") return true;
      return new Date() > new Date(this.expires_at || this.expiresAt);
    },
    async save() {
      return FeedbackLink.updateById(this.id, this);
    },
  };
  return record;
};

export const FeedbackLink = {
  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        customer_id: data.customerId,
        token:       data.token,
        expires_at:  data.expiresAt,
        status:      "PENDING",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return norm(row);
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) return null;
    return norm(data);
  },

  async findByIdWithCustomer(id) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*, customer:customers(*)")
      .eq("id", id)
      .single();
    if (error || !data) return null;
    return norm(data, data.customer);
  },

  async findByToken(token) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*, customer:customers(*)")
      .eq("token", token)
      .maybeSingle();
    if (error || !data) return null;
    return norm(data, data.customer);
  },

  async findAll() {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*, customer:customers(name,vehicle_number,vehicle_model)")
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data || []).map(r => norm(r, r.customer));
  },

  async updateById(id, updates) {
    const row = {
      status:            updates.status,
      sent_via_email:    updates.sentVia?.email    ?? updates.sent_via_email,
      sent_via_sms:      updates.sentVia?.sms      ?? updates.sent_via_sms,
      sent_via_whatsapp: updates.sentVia?.whatsapp ?? updates.sent_via_whatsapp,
    };
    // Remove undefined fields
    Object.keys(row).forEach(k => row[k] === undefined && delete row[k]);
    const { data, error } = await supabase.from(TABLE).update(row).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return norm(data);
  },
};