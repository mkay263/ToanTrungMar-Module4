import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Compass, LayoutGrid } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#F5F7FC] flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white rounded-2xl border border-slate-200/90 shadow-sm p-8 text-center space-y-6">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/brand/logo-toan-trung.png"
            alt="Logo Toàn Trung"
            className="h-9 w-auto object-contain"
          />
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#EFF5FF] border border-[#1553A2]/15 text-[#1553A2] text-xs font-bold tracking-wide">
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            <span>MÃ LỖI 404</span>
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold text-[#17253F] tracking-tight">
            Không tìm thấy trang bạn yêu cầu
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Đường dẫn có thể đã thay đổi, bị nhập sai hoặc bạn không còn cần truy cập địa chỉ này trong hệ thống nội bộ Toàn Trung.
          </p>
        </div>

        <nav aria-label="Điều hướng khôi phục" className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            href="/dashboard"
            className="min-h-[42px] px-5 rounded-xl bg-[#1553A2] hover:bg-[#0B3B8C] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-colors"
          >
            <LayoutGrid className="w-4 h-4" aria-hidden="true" />
            <span>Về Tổng quan</span>
          </Link>
          <Link
            href="/leads"
            className="min-h-[42px] px-5 rounded-xl bg-white hover:bg-slate-50 text-[#17253F] border border-slate-200 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Quản lý Lead</span>
          </Link>
        </nav>

        <footer className="pt-4 border-t border-slate-100 text-xs text-slate-500">
          Toàn Trung CRM · Hệ thống Quản trị Marketing &amp; Kinh doanh
        </footer>
      </div>
    </main>
  );
}
