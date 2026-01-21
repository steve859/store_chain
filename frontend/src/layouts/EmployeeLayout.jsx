import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { FaThLarge, FaBox, FaUserTie, FaShoppingCart, FaSignOutAlt, FaExclamationCircle, FaTruck, FaWarehouse, FaTags, FaUndo } from 'react-icons/fa';
import { cn } from '../lib/utils';
import Modal from '../components/ui/modal';
import { Button } from '../components/ui/button';
import Dashboard from '../pages/DashBoard';
import Products from '../pages/Products';
import Employee from '../pages/Employees';
import Orders from '../pages/Orders';
import Complaints from '../pages/Complaints';
import PurchaseOrders from '../pages/PurchaseOrders';
import InventoryAdjustment from '../pages/InventoryAdjustment';
import Promotions from '../pages/Promotions';
import Return from '../pages/POS/Return';
import Users from '../pages/Users';

const EmployeeLayout = () => {
    const [currentView, setCurrentView] = useState("dashboard");
    const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);
    const navigate = useNavigate();

    const handleLogout = () => {
        setIsLogoutModalOpen(true);
    };

    const confirmLogout = () => {
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('userRole');
        localStorage.removeItem('userEmail');
        setIsLogoutModalOpen(false);
        navigate('/');
    };

    // Store Manager menu: Day-to-day operations
    // Excluded: Cửa hàng, Bán hàng (POS), Người dùng, Chuyển kho
    const menuItems = [
        { id: "dashboard", name: "Dashboard", icon: <FaThLarge />, component: Dashboard },
        { id: "products", name: "Sản Phẩm", icon: <FaBox />, component: Products },
        { id: "inventory", name: "Điều Chỉnh Kho", icon: <FaWarehouse />, component: InventoryAdjustment },
        { id: "purchase", name: "Nhập Hàng", icon: <FaTruck />, component: PurchaseOrders },
        { id: "promotions", name: "Khuyến Mãi", icon: <FaTags />, component: Promotions },
        { id: "return", name: "Trả Hàng", icon: <FaUndo />, component: Return },
        { id: "orders", name: "Đơn Hàng", icon: <FaShoppingCart />, component: Orders },
        // { id: "employees", name: "Nhân Viên", icon: <FaUserTie />, component: Employee },
        { id: "users", name: "Nhân sự", icon: <FaUsers />, component: Users },
        { id: "complaints", name: "Khiếu Nại", icon: <FaExclamationCircle />, component: Complaints },
    ];

    // Get the current component to render
    const CurrentComponent = menuItems.find(item => item.id === currentView)?.component || Dashboard;

    return (
        <div className="flex h-screen bg-gray-50">
            {/* --- SIDEBAR MÀU TỐI --- */}
            <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-all">

                {/* Logo Area */}
                <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
                    <h1 className="text-xl font-bold text-sidebar-accent-foreground">Store Manager</h1>
                </div>

                {/* Menu Items */}
                <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-2">
                    {menuItems.map((item) => {
                        const isActive = currentView === item.id;
                        return (
                            <button
                                key={item.id}
                                onClick={() => setCurrentView(item.id)}
                                className={cn(
                                    'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 font-medium',
                                    isActive
                                        ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-teal-500/30'
                                        : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                                )}
                            >
                                <span className="text-lg">{item.icon}</span>
                                <span>{item.name}</span>
                            </button>
                        );
                    })}
                </nav>

                {/* User Footer */}
                <div className="p-4 border-t border-sidebar-border bg-sidebar-accent">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold">
                            M
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-sidebar-foreground">Store Manager</p>
                            <p className="text-xs text-slate-400">manager@store.com</p>
                        </div>
                    </div>

                    {/* Logout Button */}
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-all duration-200 font-medium"
                    >
                        <FaSignOutAlt className="text-sm" />
                        <span>Đăng xuất</span>
                    </button>
                </div>
            </aside>

            {/* --- MAIN CONTENT --- */}
            <main className="flex-1 overflow-x-auto overflow-y-auto">
                <header className='h-16 flex items-center px-6 border-b border-gray-300'></header>
                <div className='p-8'>
                    <CurrentComponent />
                </div>
            </main>

            {/* Logout Confirmation Modal */}
            <Modal
                isOpen={isLogoutModalOpen}
                onClose={() => setIsLogoutModalOpen(false)}
                title="Xác nhận đăng xuất"
            >
                <div className="space-y-4">
                    <p>Bạn có chắc chắn muốn đăng xuất?</p>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsLogoutModalOpen(false)}>
                            Hủy
                        </Button>
                        <Button
                            onClick={confirmLogout}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            Đăng xuất
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default EmployeeLayout;
