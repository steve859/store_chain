import React from "react";
import { createBrowserRouter } from "react-router-dom";

import AdminLayout from "../layouts/AdminLayout";
import EmployeeLayout from "../layouts/EmployeeLayout";
import CashierLayout from "../layouts/CashierLayout";
import Login from "../pages/Login";

const router = createBrowserRouter([
	{
		path: "/",
		element: React.createElement(Login),
	},
	{
		path: "/admin",
		element: React.createElement(AdminLayout),
	},
	{
		path: "/employee",
		element: React.createElement(EmployeeLayout),
	},
	{
		path: "/cashier",
		element: React.createElement(CashierLayout),
	},
]);

export default router;
