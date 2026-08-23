import { supabase } from "../config/supabase.js";
const TABLE = "service_centers";
const norm = (row) => row ? ({ ...row, _id: row.id, managerEmail: row.manager_email, createdAt: row.created_at }) : null;
export const ServiceCenter = {
  async findAll() { const { data, error } = await supabase.from(TABLE).select("*").eq("is_active", true).order("name"); if (error) throw new Error(error.message); return (data || []).map(norm); },
  async findByName(name) { const { data } = await supabase.from(TABLE).select("*").eq("name", name).maybeSingle(); return norm(data); },
  async create(data) { const { data: row, error } = await supabase.from(TABLE).insert({ name: data.name, location: data.location, manager_email: data.managerEmail }).select().single(); if (error) throw new Error(error.message); return norm(row); },
  async update(id, data) { const { data: row, error } = await supabase.from(TABLE).update({ name: data.name, location: data.location, manager_email: data.managerEmail }).eq("id", id).select().single(); if (error) throw new Error(error.message); return norm(row); },
  async delete(id) { const { error } = await supabase.from(TABLE).delete().eq("id", id); if (error) throw new Error(error.message); },
};
