export const useConfirmDelete = (deleteFunction, onSuccess) => {
  
  const handleDelete = async (id, name) => {
    const isConfirmed = window.confirm(`Bạn có chắc chắn muốn xóa "${name}" không?`);
    
    if (isConfirmed) {
      try {
        await deleteFunction(id);
        alert("Đã xóa thành công!");
        
        // SỬA CHỖ NÀY: Truyền id vào onSuccess để bên ngoài biết thằng nào vừa chết
        if (onSuccess) onSuccess(id); 
        
      } catch (error) {
        alert("Có lỗi xảy ra!");
        console.error(error);
      }
    }
  };

  return handleDelete;
};