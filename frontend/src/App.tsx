import './App.css'
// 1. Import Button từ đường dẫn file của bạn
import { Button } from "./components/ui/button";

function App() {
  return (
    // 2. Dán phần code hiển thị demo vào đây
    <div className="min-h-screen bg-gray-50 flex justify-center items-center">
      <div className="p-8 space-y-4 border rounded-lg bg-white shadow-md">
        <h1 className="text-2xl font-bold mb-4">Button Variants Test</h1>

        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="w-24 text-sm font-medium">Default:</span>
            <Button>Default Button</Button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-24 text-sm font-medium">Secondary:</span>
            {/* Đảm bảo Button.tsx của bạn đã hỗ trợ prop variant */}
            <Button variant="secondary">Secondary</Button>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className="w-24 text-sm font-medium">Outline:</span>
            <Button variant="outline">Outline</Button>
          </div>

          <div className="flex items-center space-x-2">
            <span className="w-24 text-sm font-medium">Sizes:</span>
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;