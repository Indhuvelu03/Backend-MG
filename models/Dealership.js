// models/Dealership.js — Supabase data access
import { supabase } from "../config/supabase.js";

const TABLE = "dealerships";

const norm = (row) => {
  if (!row) return null;
  return {
    ...row,
    _id:          row.id,
    managerEmail: row.manager_email,
    isActive:     row.is_active,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
};

export const Dealership = {
  async create(data) {
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({
        name:          data.name,
        code:          data.code?.toUpperCase(),
        city:          data.city,
        manager_email: data.managerEmail?.toLowerCase() || null,
        phone:         data.phone || null,
        is_active:     true,
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

  async findAll() {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return [];
    return (data || []).map(norm);
  },

  async updateById(id, data) {
    const updates = {};
    if (data.name)                  updates.name          = data.name;
    if (data.code)                  updates.code          = data.code.toUpperCase();
    if (data.city)                  updates.city          = data.city;
    if (data.managerEmail !== undefined) updates.manager_email = data.managerEmail?.toLowerCase() || null;
    if (data.phone !== undefined)   updates.phone         = data.phone;
    if (data.isActive !== undefined)updates.is_active     = data.isActive;
    updates.updated_at = new Date().toISOString();

    const { data: row, error } = await supabase.from(TABLE).update(updates).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return norm(row);
  },

  async deleteById(id) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};
