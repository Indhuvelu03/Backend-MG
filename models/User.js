// models/User.js — Supabase data access
import { supabase } from "../config/supabase.js";
import bcrypt from "bcrypt";

const TABLE = "users";
const norm  = (row) => row ? { ...row, _id: row.id, isActive: row.is_active } : null;

export const User = {
  async findByEmail(email) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("email", email.toLowerCase()).single();
    if (error || !data) return null;
    return norm(data);
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select("id,name,email,role,is_active,created_at").eq("id", id).single();
    if (error || !data) return null;
    return norm(data);
  },

  async findOne(query) {
    let q = supabase.from(TABLE).select("*");
    for (const [key, val] of Object.entries(query)) q = q.eq(key, val);
    const { data } = await q.maybeSingle();
    return norm(data);
  },

  async countDocuments() {
    const { count } = await supabase.from(TABLE).select("id", { count: "exact", head: true });
    return count ?? 0;
  },

  async create(data) {
    const hashed = await bcrypt.hash(data.password, 10);
    const { data: row, error } = await supabase
      .from(TABLE)
      .insert({ name: data.name, email: data.email?.toLowerCase(), password: hashed, role: data.role || "STAFF", is_active: true })
      .select("id,name,email,role,is_active,created_at")
      .single();
    if (error) throw new Error(error.message);
    return norm(row);
  },

  async comparePassword(storedHash, plainPassword) {
    return bcrypt.compare(plainPassword, storedHash);
  },
};