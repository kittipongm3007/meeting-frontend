import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: true,        // ให้เข้าถึงจากเครื่องอื่นในแลนได้ (ถ้าต้องการ)
        strictPort: true   // ถ้ามีการใช้งานพอร์ตอยู่แล้ว ให้ error ทันที (ไม่สลับพอร์ตเอง)
    }
})
