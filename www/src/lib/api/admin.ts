import { apiFetch } from "./client";

export type AdminStore = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  acceptingOrders: boolean;
  online: boolean;
  lastSeen?: string;
  productCount: number;
  orders30d: number;
  sales30d: number;
};

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  tiendaId?: string;
  active: boolean;
};

export type AdminDashboardData = {
  stores: AdminStore[];
  users: AdminUser[];
  stats: {
    storeCount: number;
    onlineCount: number;
    userCount: number;
    orderCount: number;
    sales30d: number;
  };
};

export function fetchAdminDashboard() {
  return apiFetch<AdminDashboardData>("/api/admin/dashboard");
}

export function updateManagedUser(userId: string, active: boolean) {
  return apiFetch<AdminUser>(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ active }),
  });
}
