// models/Customer.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "customers";

const norm = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id: row.id,
    vehicleNumber: row.vehicle_number,
    vehicleModel:  row.vehicle_model,
    serviceCenter: row.service_center,
    serviceDate:   row.service_date,
    createdBy:     row.created_by,
    createdAt:     row.created_at,
  };
};

const toInsert = (data) => ({
  name:           data.name,
  mobile:         data.mobile,
  email:          data.email?.toLowerCase() || null,
  vehicle_number: data.vehicleNumber?.toUpperCase() || data.vehicle_number,
  vehicle_model:  data.vehicleModel  || data.vehicle_model,
  service_center: data.serviceCenter || data.service_center,
  service_date:   data.serviceDate   || data.service_date   || new Date().toISOString(),
  created_by:     data.createdBy     || data.created_by     || null,
});

export const Customer = {
  async create(data) {
    const { data: row, error } = await supabase.from(TABLE).insert(toInsert(data)).select().single();
    if (error) throw new Error(error.message);
    return norm(row);
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) return null;
    return norm(data);
  },

  async findOne(query) {
    let q = supabase.from(TABLE).select("*");
    if (query.vehicleNumber) q = q.eq("vehicle_number", query.vehicleNumber.toUpperCase());
    if (query.mobile)        q = q.eq("mobile", query.mobile);
    if (query.email)         q = q.eq("email", query.email.toLowerCase());
    const { data } = await q.maybeSingle();
    return norm(data);
  },

  async find(query = {}, { sort, skip = 0, limit = 10 } = {}) {
    let q = supabase.from(TABLE).select("*, created_by_user:users(name,email)", { count: "exact" });

    if (query.$or) {
      // Search across fields — use ilike
      const search = query.$or[0]?.name?.source?.replace("(?i)", "") || "";
      if (search) {
        q = q.or(`name.ilike.%${search}%,vehicle_number.ilike.%${search}%,mobile.ilike.%${search}%,service_center.ilike.%${search}%`);
      }
    }

    q = q.order("created_at", { ascending: false }).range(skip, skip + limit - 1);
    const { data, count, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: (data || []).map(norm), total: count ?? 0 };
  },

  async countDocuments(query = {}) {
    let q = supabase.from(TABLE).select("id", { count: "exact", head: true });
    if (query.$or) {
      const search = query.$or[0]?.name?.source?.replace("(?i)", "") || "";
      if (search) q = q.or(`name.ilike.%${search}%,vehicle_number.ilike.%${search}%`);
    }
    const { count } = await q;
    return count ?? 0;
  },

  async findByIdAndUpdate(id, data) {
    const updates = {};
    if (data.name)           updates.name           = data.name;
    if (data.mobile)         updates.mobile         = data.mobile;
    if (data.email)          updates.email          = data.email.toLowerCase();
    if (data.vehicleNumber)  updates.vehicle_number = data.vehicleNumber.toUpperCase();
    if (data.vehicleModel)   updates.vehicle_model  = data.vehicleModel;
    if (data.serviceCenter)  updates.service_center = data.serviceCenter;
    if (data.serviceDate)    updates.service_date   = data.serviceDate;

    const { data: row, error } = await supabase.from(TABLE).update(updates).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return norm(row);
  },

  async findByIdAndDelete(id) {
    const { data, error } = await supabase.from(TABLE).delete().eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return norm(data);
  },
};
