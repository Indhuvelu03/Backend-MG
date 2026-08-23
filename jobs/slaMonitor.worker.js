import { Complaint } from "../models/Complaint.js";
import { Customer } from "../models/Customer.js";
import { ServiceCenter } from "../models/ServiceCenter.js";
import { SlaAlert } from "../models/SlaAlert.js";
import { sendSlaEscalation } from "../services/email.service.js";
import { logger } from "../utils/logger.js";

const SLA_MINUTES = 30;
const scan = async () => {
  try {
    for (const complaint of await Complaint.findAll()) {
      if (["COMPARED", "FAILED"].includes(complaint.status)) continue;
      const ageMinutes = (Date.now() - new Date(complaint.createdAt || complaint.created_at).getTime()) / 60000;
      if (ageMinutes < SLA_MINUTES || await SlaAlert.exists(complaint.id, complaint.status)) continue;
      const customer = await Customer.findById(complaint.customerId);
      const center = await ServiceCenter.findByName(customer?.serviceCenter || customer?.service_center).catch(() => null);
      const managerEmail = center?.managerEmail || process.env.MANAGER_EMAIL;
      if (!managerEmail) continue;
      await sendSlaEscalation({ managerEmail, customerName: customer?.name || "Customer", vehicleNumber: complaint.vehicleNumber, status: complaint.status, ageMinutes: Math.floor(ageMinutes) });
      await SlaAlert.record(complaint.id, complaint.status);
    }
  } catch (error) { logger.error(`SLA monitor failed: ${error.message}`); }
};
scan();
setInterval(scan, 15 * 60 * 1000).unref();
