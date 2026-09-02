// middleware/tenant.middleware.js — Multi-tenant Isolation & Ownership Verification Helpers
import { AppError } from "../utils/AppError.js";

/**
 * Returns the effective dealershipId for a request.
 * - For ADMIN: allows explicit requested Dealership ID or undefined (all network).
 * - For DEALER / STAFF: strictly locks to req.user.dealershipId.
 */
export const getEffectiveTenantId = (req, requestedDealershipId) => {
  if (req.user?.role === "ADMIN") {
    return requestedDealershipId || undefined;
  }
  const userTenant = req.user?.dealershipId || req.user?.dealership_id;
  if (!userTenant) {
    throw new AppError("User is not associated with any dealership branch", 403);
  }
  return userTenant;
};

/**
 * Verifies that a database record belongs to the logged-in user's dealership.
 * - ADMIN role bypasses tenant checks.
 * - Non-admin roles (DEALER / STAFF) are denied access if resource.dealershipId !== req.user.dealershipId.
 */
export const verifyTenantOwnership = (resource, reqUser, resourceName = "Resource") => {
  if (!reqUser) {
    throw new AppError("Authentication context missing", 401);
  }

  // ADMIN has system-wide access
  if (reqUser.role === "ADMIN") {
    return true;
  }

  const userTenant = (reqUser.dealershipId || reqUser.dealership_id)?.toString();
  if (!userTenant) {
    throw new AppError("User account is not linked to a dealership branch", 403);
  }

  if (!resource) {
    throw new AppError(`${resourceName} not found`, 404);
  }

  // Determine resource dealership ID
  let resourceTenant = (
    resource.dealershipId ||
    resource.dealership_id ||
    resource.dealerId ||
    resource.customer?.dealershipId ||
    resource.customer?.dealership_id
  )?.toString();

  // If resource has no direct dealership ID, check if it has a customerId object
  if (!resourceTenant && typeof resource.customerId === "object" && resource.customerId) {
    resourceTenant = (resource.customerId.dealershipId || resource.customerId.dealership_id)?.toString();
  }

  // A resource without a tenant is legacy data. It must never be silently
  // exposed to a dealership user, otherwise one branch can access data that
  // has not yet been backfilled by the tenancy migration.
  if (!resourceTenant) {
    throw new AppError(`${resourceName} is not assigned to a dealership branch`, 403);
  }

  if (resourceTenant !== userTenant) {
    throw new AppError(`Access denied: ${resourceName} belongs to another dealership branch`, 403);
  }

  return true;
};
