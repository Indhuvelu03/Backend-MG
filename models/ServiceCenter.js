import { supabase } from "../config/supabase.js";

const TABLE = "service_centers";

const norm = (row) => row ? ({
  ...row,
  _id:          row.id,
  branch:       row.branch || row.location,
  location:     row.location || row.branch,
  phone:        row.phone || null,
  managerEmail: row.manager_email || row.managerEmail,
  dealershipId: row.dealership_id || row.dealershipId,
  createdAt:    row.created_at,
}) : null;

export const ServiceCenter = {
  async findAll({ dealershipId } = {}) {
    if (dealershipId) {
      const { data, error } = await supabase.from(TABLE).select("*").eq("dealership_id", dealershipId).order("name");
      if (!error) return (data || []).map(norm);
    }

    const { data, error } = await supabase.from(TABLE).select("*").order("name");
    if (error) throw new Error(error.message);
    const list = (data || []).map(norm);
    if (dealershipId) {
      return list.filter(item => !item.dealershipId || item.dealershipId === dealershipId);
    }
    return list;
  },

  async findById(id) {
    const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).maybeSingle();
    if (error || !data) return null;
    return norm(data);
  },

  async findByName(name) {
    const { data } = await supabase.from(TABLE).select("*").ilike("name", `%${name}%`).maybeSingle();
    return norm(data);
  },

  async create(data) {
    const fullPayload = {
      name:          data.name,
      location:      data.branch || data.location,
      branch:        data.branch || data.location,
      phone:         data.phone || null,
      manager_email: data.managerEmail || data.manager_email,
      dealership_id: data.dealershipId || data.dealership_id || null,
    };

    let { data: row, error } = await supabase
      .from(TABLE)
      .insert(fullPayload)
      .select()
      .single();

    if (error && (error.message.includes("dealership_id") || error.message.includes("branch"))) {
      const fallbackPayload = {
        name:          data.name,
        location:      data.branch || data.location,
        manager_email: data.managerEmail || data.manager_email,
      };
      if (data.phone) fallbackPayload.phone = data.phone;

      const res = await supabase.from(TABLE).insert(fallbackPayload).select().single();
      if (res.error) throw new Error(res.error.message);
      row = res.data;
    } else if (error) {
      throw new Error(error.message);
    }

    return norm(row);
  },

  async update(id, data) {
    const updates = {};
    if (data.name !== undefined)         updates.name          = data.name;
    if (data.branch !== undefined)       updates.branch        = data.branch;
    if (data.location !== undefined)     updates.location      = data.location || data.branch;
    if (data.phone !== undefined)        updates.phone         = data.phone;
    if (data.managerEmail !== undefined) updates.manager_email = data.managerEmail;
    if (data.manager_email !== undefined)updates.manager_email = data.manager_email;

    let { data: row, error } = await supabase
      .from(TABLE)
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error && error.message.includes("branch")) {
      delete updates.branch;
      const res = await supabase.from(TABLE).update(updates).eq("id", id).select().single();
      if (res.error) throw new Error(res.error.message);
      row = res.data;
    } else if (error) {
      throw new Error(error.message);
    }

    return norm(row);
  },

  async delete(id) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);
  },
};

