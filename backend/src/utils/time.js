
// Formats a Date as "YYYY-MM-DD - HH:mm" in South African Standard Time.
function formatSastTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false, // 24-hour clock
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;

  const year  = get("year");
  const month = get("month");
  const day   = get("day");
  // Some environments return "24" for midnight when hour12:false; normalize to "00"
  let hour    = get("hour");
  if (hour === "24") hour = "00";
  const minute = get("minute");

  return `${year}-${month}-${day} - ${hour}:${minute}`;
}

module.exports = { formatSastTimestamp };