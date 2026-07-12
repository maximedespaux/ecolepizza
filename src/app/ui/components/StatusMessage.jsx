/** status : { type: "success" | "error", message: string } | null */
function StatusMessage({ status }) {
  if (!status) return null;
  const isError = status.type === "error";
  return (
    <div
      className={`status ${isError ? "err" : "ok"}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {status.message}
    </div>
  );
}

export default StatusMessage;
