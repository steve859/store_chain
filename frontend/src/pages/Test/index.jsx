import React, { useRef, useEffect } from "react";
// Chú ý đường dẫn import (như đã sửa ở bước trước)
import { Card } from "../../components/ui/card"; 
// HOẶC import { Card } from "../../components/ui/card";

export default function TestRefCard() {
  // 1. Khởi tạo ref đúng cách (có ngoặc tròn)
  const cardRef = useRef(null); 

  useEffect(() => {
    // Kiểm tra xem đã lấy được thẻ div chưa
    if (cardRef.current) {
      console.log("Đã lấy được thẻ Card:", cardRef.current);
      // Thử đổi màu nền để test
      
    }
  }, []);

  return (
    <div className="p-10">
      <h1>Test Ref</h1>
      
      {/* 2. Truyền ref vào Component Card */}
      <Card ref={cardRef} className="p-5 border-4">
        Nội dung bên trong thẻ Card
      </Card>
    </div>
  );
}