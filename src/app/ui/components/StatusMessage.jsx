/** status : { type: "success" | "error", message: string } | null */
function StatusMessage({ status }) {
  if (!status) return null;
  return (
    <div className={`status ${status.type === "error" ? "err" : "ok"}`}>
      {status.message}
    </div>
  );
}

export default StatusMessage;
