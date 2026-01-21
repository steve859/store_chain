import React, { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { FaThLarge, FaBox, FaSignOutAlt, FaExclamationCircle, FaCashRegister } from 'react-icons/fa';
import { cn } from '../lib/utils';
import Dashboard from '../pages/DashBoard';
import Products from '../pages/Products';
import Complaints from '../pages/Complaints';
import POS from '../pages/POS';
import { ShiftProvider, ShiftStatusBar, useShift } from '../components/shift/ShiftManager';

// Inner layout that uses shift context
const CashierLayoutInner = () => {
    const [currentView, setCurrentView] = useState("pos"); // Cashiers start at POS
    const navigate = useNavigate();
    const { isShiftOpen, requestCloseModal } = useShift();

    const handleLogout = () => {
        // Must close shift before logout
        if (isShiftOpen) {
            alert('Vui lòng đóng ca làm việc trước khi đăng xuất!');
            requestCloseModal();
            return;
        }

        const confirmed = window.confirm('Bạn có chắc chắn muốn đăng xuất?');
        if (confirmed) {
            localStorage.removeItem('isAuthenticated');
            localStorage.removeItem('userRole');
            localStorage.removeItem('userEmail');
            navigate('/');
        }
    };

    // Cashier menu: Day-to-day checkout activities only
    const menuItems = [
        { id: "dashboard", name: "Dashboard", icon: <FaThLarge />, component: Dashboard },
        { id: "pos", name: "Bán Hàng (POS)", icon: <FaCashRegister />, component: POS },
        { id: "products", name: "Sản Phẩm", icon: <FaBox />, component: Products },
        { id: "complaints", name: "Khiếu Nại", icon: <FaExclamationCircle />, component: Complaints },
    ];

    // Get the current component to render
    const CurrentComponent = menuItems.find(item => item.id === currentView)?.component || POS;

    return (
        <div className="flex h-screen bg-gray-50">
            {/* --- SIDEBAR MÀU TỐI --- */}
            <aside className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground shadow-xl transition-all">

                {/* Logo Area */}
                <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
                    <h1 className="text-xl font-bold text-sidebar-accent-foreground">Store POS</h1>
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
                        <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center text-white font-bold">
                            C
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-sidebar-foreground">Cashier</p>
                            <p className="text-xs text-slate-400">{localStorage.getItem('userEmail') || 'cashier@store.com'}</p>
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
                {/* Header with Shift Status */}
                <header className='h-16 flex items-center justify-between px-6 border-b border-gray-300 bg-white'>
                    <div className="flex items-center gap-4">
                        <h2 className="font-semibold text-gray-700">
                            {menuItems.find(item => item.id === currentView)?.name || 'Dashboard'}
                        </h2>
                    </div>
                    <ShiftStatusBar />
                </header>
                <div className='p-8'>
                    <CurrentComponent />
                </div>
            </main>
        </div>
    );
};

// Wrapper with ShiftProvider
const CashierLayout = () => {
    return (
        <ShiftProvider>
            <CashierLayoutInner />
        </ShiftProvider>
    );
};

export default CashierLayout;
