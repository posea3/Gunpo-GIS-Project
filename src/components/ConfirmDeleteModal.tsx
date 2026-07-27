interface ConfirmDeleteModalProps {
  isOpen: boolean;
  targetName: string;
  isDeleting: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmDeleteModal({
  isOpen,
  targetName,
  isDeleting,
  onCancel,
  onConfirm,
}: ConfirmDeleteModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/50 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-modal-title"
    >
      <section className="w-full max-w-sm rounded-md bg-white p-6 shadow-xl">
        <h2 id="delete-modal-title" className="text-lg font-semibold text-slate-950">
          위치 삭제
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          <span className="font-semibold text-slate-950">{targetName}</span> 항목을
          삭제합니다.
        </p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={onCancel}
            disabled={isDeleting}
          >
            취소
          </button>
          <button
            type="button"
            className="rounded-md bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            onClick={() => {
              if (!isDeleting) {
                void onConfirm();
              }
            }}
            disabled={isDeleting}
          >
            {isDeleting ? '삭제 중' : '삭제'}
          </button>
        </div>
      </section>
    </div>
  );
}
