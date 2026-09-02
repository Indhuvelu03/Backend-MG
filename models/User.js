// models/User.js — Supabase data access
import { supabase } from "../config/supabase.js";
import bcrypt from "bcrypt";

const TABLE = "users";
const norm = async (row) => {
  if (!row) return null;
  return {
    ...row,
    role: row.role,
    _id: row.id,
    isActive: row.is_active,
    dealershipId: row.dealership_id,
    mfaEnabled: row.mfa_enabled || false,
    tokenVersion: row.token_version || 0,
  };
};

export const User = {
  async findByEmail(email) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("email", email.toLowerCase()).single();
    if (error || !data) return null;
    return await norm(data);
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
    if (error || !data) return null;
    return await norm(data);
  },

  async findOne(query) {
    let q = supabase.from(TABLE).select("*");
    for (const [key, val] of Object.entries(query)) q = q.eq(key, val);
    const { data } = await q.maybeSingle();
    return await norm(data);
  },

  async countDocuments() {
    const { count } = await supabase.from(TABLE).select("id", { count: "exact", head: true });
    return count ?? 0;
  },

  async findAll() {
    const { data, error } = await supabase.from(TABLE).select("*").order("created_at", { ascending: false });
    if (error || !data) return [];
    return Promise.all(data.map(norm));
  },

  async create(data) {
    const hashed = await bcrypt.hash(data.password, 10);
    const insertData = {
      name: data.name,
      email: data.email?.toLowerCase(),
      password: hashed,
      role: data.role || "STAFF",
      is_active: true,
    };
    if (data.dealershipId || data.dealership_id) {
      insertData.dealership_id = data.dealershipId || data.dealership_id;
    }
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert(insertData)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return await norm(row);
  },

  async update(id, data) {
    const updates = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.role !== undefined) updates.role = data.role;
    if (data.email) updates.email = data.email.toLowerCase();
    if (data.dealershipId !== undefined || data.dealership_id !== undefined) {
      updates.dealership_id = data.dealershipId || data.dealership_id || null;
    }
    const { data: row, error } = await supabase.from(TABLE).update(updates).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return await norm(row);
  },

  async updatePassword(id, password) {
    const hashed = await bcrypt.hash(password, 12);
    const { error } = await supabase.from(TABLE).update({ password: hashed, token_version: (await User.findById(id))?.tokenVersion + 1 }).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async updateMfa(id, { encryptedSecret, enabled }) {
    const updates = {};
    if (encryptedSecret !== undefined) updates.mfa_secret_encrypted = encryptedSecret;
    if (enabled !== undefined) updates.mfa_enabled = enabled;
    const { data, error } = await supabase.from(TABLE).update(updates).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return norm(data);
  },

  async delete(id) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async comparePassword(storedHash, plainPassword) {
    return bcrypt.compare(plainPassword, storedHash);
  },
};
