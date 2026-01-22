import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import bgImage from "../../assets/bg.jpg";
import { FaLock, FaExclamationTriangle } from "react-icons/fa";
import axiosClient from "../../services/axiosClient";

// Lockout duration in milliseconds (5 minutes)
const LOCKOUT_DURATION = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const Login = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [rememberMe, setRememberMe] = useState(false);

  // Lockout state
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Load saved email and lockout state on component mount
  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setUsername(savedEmail);
      setRememberMe(true);
    }

    // Check for existing lockout
    const savedLockout = localStorage.getItem("loginLockout");
    if (savedLockout) {
      const lockoutData = JSON.parse(savedLockout);
      const lockoutTime = new Date(lockoutData.until);
      if (lockoutTime > new Date()) {
        setLockoutUntil(lockoutTime);
        setFailedAttempts(lockoutData.attempts);
      } else {
        // Lockout expired, clear it
        localStorage.removeItem("loginLockout");
      }
    }
  }, []);

  // Update lockout countdown
  useEffect(() => {
    if (!lockoutUntil) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, lockoutUntil - new Date());
      setLockoutRemaining(remaining);

      if (remaining <= 0) {
        setLockoutUntil(null);
        setFailedAttempts(0);
        localStorage.removeItem("loginLockout");
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [lockoutUntil]);

  // Email validation regex
  const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Format remaining time
  const formatRemainingTime = () => {
    const minutes = Math.floor(lockoutRemaining / 60000);
    const seconds = Math.floor((lockoutRemaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Handle failed login
  const handleFailedLogin = () => {
    const newAttempts = failedAttempts + 1;
    setFailedAttempts(newAttempts);

    if (newAttempts >= MAX_ATTEMPTS) {
      const lockoutTime = new Date(Date.now() + LOCKOUT_DURATION);
      setLockoutUntil(lockoutTime);
      setError(`Tài khoản bị khóa tạm thời do đăng nhập sai ${MAX_ATTEMPTS} lần. Vui lòng thử lại sau.`);

      // Save lockout to localStorage
      localStorage.setItem("loginLockout", JSON.stringify({
        until: lockoutTime.toISOString(),
        attempts: newAttempts,
        ip: "client", // In real app, you'd log the IP from backend
      }));

      // Log the lockout event
      console.log(`[LOGIN] Account locked at ${new Date().toISOString()} - IP: client`);
    } else {
      setError(`Tài khoản hoặc mật khẩu không đúng. Còn ${MAX_ATTEMPTS - newAttempts} lần thử.`);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    setError(""); // Clear previous errors

    // Check if locked out
    if (lockoutUntil && lockoutUntil > new Date()) {
      setError(`Tài khoản đang bị khóa. Vui lòng thử lại sau ${formatRemainingTime()}.`);
      return;
    }

    // Validate empty fields
    if (!username.trim()) {
      setError("Vui lòng nhập tên đăng nhập hoặc email");
      return;
    }

    if (!password.trim()) {
      setError("Vui lòng nhập mật khẩu");
      return;
    }

    // Validate email format
    if (!isValidEmail(username)) {
      setError("Email không hợp lệ");
      return;
    }

    // Save or remove email based on remember me checkbox
    if (rememberMe) {
      localStorage.setItem("rememberedEmail", username);
    } else {
      localStorage.removeItem("rememberedEmail");
    }

    axiosClient
      .post("/auth/login", { email: username, password })
      .then((res) => {
        const token = res?.data?.token;
        const user = res?.data?.user;

        if (!token || !user) {
          setError("Đăng nhập thất bại: phản hồi không hợp lệ");
          return;
        }

        // Clear failed attempts on successful login
        setFailedAttempts(0);
        localStorage.removeItem("loginLockout");

        localStorage.setItem("token", token);
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("userEmail", user.email || username);
        localStorage.setItem("userRole", user.role || "");
        localStorage.setItem("user", JSON.stringify(user));

        const primaryStoreId = user.primaryStoreId ?? user.storeId ?? user.stores?.find?.((s) => s.isPrimary)?.storeId ?? user.stores?.[0]?.storeId;
        if (primaryStoreId) {
          localStorage.setItem("activeStoreId", String(primaryStoreId));
        }

        const role = String(user.role || "").toLowerCase();
        if (role.includes("admin")) {
          navigate("/admin");
        } else if (role.includes("cashier")) {
          navigate("/cashier");
        } else {
          navigate("/employee");
        }
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 401) {
          handleFailedLogin();
          return;
        }
        setError(err?.response?.data?.message || err?.message || "Đăng nhập thất bại");
      });
  };

  const isLocked = lockoutUntil && lockoutUntil > new Date();

  return (
    <div
      className="relative flex items-center justify-center h-screen p-4"
      style={{
        backgroundImage: `url(${bgImage})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Dark overlay to gray out the background */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      />

      <Card className="max-w-md w-full relative z-10">
        <CardContent className="p-6">
          <h1 className="text-2xl font-bold text-center mb-4">Đăng nhập</h1>

          {/* Lockout Warning Banner */}
          {isLocked && (
            <div className="bg-red-100 border border-red-300 rounded-lg p-4 mb-4 flex items-center gap-3">
              <FaLock className="text-red-600 text-xl" />
              <div>
                <p className="font-medium text-red-800">Tài khoản bị khóa tạm thời</p>
                <p className="text-sm text-red-600">
                  Thử lại sau: <span className="font-mono font-bold">{formatRemainingTime()}</span>
                </p>
              </div>
            </div>
          )}

          <form onSubmit={submit} className="space-y-4">
            {/* Error Message */}
            {error && !isLocked && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex items-center gap-2">
                <FaExclamationTriangle />
                {error}
              </div>
            )}

            {/* Failed Attempts Warning */}
            {failedAttempts > 0 && failedAttempts < MAX_ATTEMPTS && !isLocked && (
              <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-2 rounded-md text-sm">
                ⚠️ Cảnh báo: Còn {MAX_ATTEMPTS - failedAttempts} lần thử trước khi bị khóa
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="admin / manager / cashier @store.com"
                autoComplete="username"
                disabled={isLocked}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Mật khẩu</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-teal-500"
                placeholder="Mật khẩu (mặc định: 123456)"
                autoComplete="current-password"
                disabled={isLocked}
              />
            </div>

            {/* Remember Me Checkbox */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember-me"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="remember-me" className="text-sm text-gray-700 cursor-pointer">
                Ghi nhớ tôi
              </label>
            </div>

            <div className="flex items-center justify-between pt-2">
              <Button type="submit" disabled={isLocked}>
                {isLocked ? "Đang bị khóa" : "Đăng nhập"}
              </Button>
              <Button variant="ghost" onClick={() => alert("Store Manager v2.0\nỨng dụng quản lý cửa hàng tiện lợi.\n\nĐăng nhập:\n• admin@store.com (Quản trị viên)\n• manager@store.com (Quản lý cửa hàng)\n• cashier@store.com (Thu ngân)\n\nMật khẩu: 123456")}>
                About
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;