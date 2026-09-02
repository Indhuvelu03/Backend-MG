export const maskEmail = email => {
  if (!email || !String(email).includes("@")) return email;
  const [local, domain] = String(email).split("@");
  return `${local.slice(0, 2)}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
};

export const maskMobile = mobile => {
  if (!mobile) return mobile;
  const value = String(mobile);
  const digits = value.replace(/\D/g, "");
  return digits.length < 4 ? "****" : `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
};

export const protectCustomerContact = (customer, user) => {
  if (!customer || user?.role !== "STAFF") return customer;
  return { ...customer, email: maskEmail(customer.email), mobile: maskMobile(customer.mobile) };
};
