import { createBrowserRouter } from "react-router-dom";
import AdminLayout from "../layouts/AdminLayout";
import EmployeeLayout from "../layouts/EmployeeLayout";
import CashierLayout from "../layouts/CashierLayout";
import Login from "../pages/Login";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Login />, // Show login at root
  },
  {
    path: "/admin",
    element: <AdminLayout />, // Admin panel - general operations
  },
  {
    path: "/employee",
    element: <EmployeeLayout />, // Store Manager panel
  },
  {
    path: "/cashier",
    element: <CashierLayout />, // Cashier panel - day-to-day POS
  },
]);

export default router;