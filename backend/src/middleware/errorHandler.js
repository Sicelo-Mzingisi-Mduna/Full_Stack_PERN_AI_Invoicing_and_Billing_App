const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { formatSastTimestamp } = require("../utils/time");

// ─────────────────────────────────────────────────────────────────────────────
// Pluggable logger — replace with winston/pino/your-logger
// ─────────────────────────────────────────────────────────────────────────────
const logger = {
  error: (payload) => console.error(JSON.stringify(payload)),
  warn:  (payload) => console.warn(JSON.stringify(payload)),
};

// ─────────────────────────────────────────────────────────────────────────────
// n8n dispatch — fire-and-forget, never blocks or throws
// ─────────────────────────────────────────────────────────────────────────────
// function dispatchToN8n(payload) {
//   if (!env.N8N_API_ERROR_LOGGER_WEBHOOK_URL) return;
//   // Do not await — we never want webhook latency on the request path
//   fetch(env.N8N_API_ERROR_LOGGER_WEBHOOK_URL, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/json",
//       ...(env.N8N_API_ERROR_LOGGER_WEBHOOK_SECRET
//         ? { "X-Webhook-Secret": env.N8N_API_ERROR_LOGGER_WEBHOOK_SECRET }
//         : {}),
//     },
//     body: JSON.stringify(payload),
//   }).catch((e) => {
//     logger.warn({
//       eventType: "n8n_dispatch_failed",
//       reason: e?.message,
//       originalCode: payload?.error?.code,
//     });
//   });
// }

// ─────────────────────────────────────────────────────────────────────────────
// PostgreSQL SQLSTATE map (enriched with plain-English metadata)
// Reference: https://www.postgresql.org/docs/current/errcodes-appendix.html
// ─────────────────────────────────────────────────────────────────────────────
const PG_ERRORS = {
  // ── Class 08 — Connection Exception ──────────────────────────────────────
  "08000": { status: 503, code: "DB_CONNECTION_ERROR", message: "Database connection error",
    category: "infrastructure", retryable: true,
    explanation: "The connection to the database broke unexpectedly.",
    example: "Neon did maintenance and dropped your connection pool mid-request.",
    remediation: "Retry with backoff. Check pool health." },
  "08001": { status: 503, code: "DB_UNABLE_TO_CONNECT", message: "Unable to establish database connection",
    category: "infrastructure", retryable: true,
    explanation: "The application could not open a connection to the database at all.",
    example: "Wrong DATABASE_URL, or the Neon project is suspended.",
    remediation: "Verify credentials, region, and that the DB is online." },
  "08003": { status: 503, code: "DB_CONNECTION_MISSING", message: "Database connection does not exist",
    category: "developer", retryable: false,
    explanation: "Code used a connection that was never opened.",
    example: "A pool client was used before .connect() was called.",
    remediation: "Fix the pool/connection lifecycle in code." },
  "08004": { status: 503, code: "DB_REJECTED_CONNECTION", message: "Database rejected the connection",
    category: "infrastructure", retryable: true,
    explanation: "The database refused the connection (too many clients, banned IP, etc.).",
    example: "Neon connection limit reached during a traffic spike.",
    remediation: "Use connection pooling / Neon's pooler endpoint." },
  "08006": { status: 503, code: "DB_CONNECTION_FAILURE", message: "Database connection failure",
    category: "infrastructure", retryable: true,
    explanation: "The connection died while in use.",
    example: "Serverless function ran too long and Neon closed the idle connection.",
    remediation: "Retry. Consider shorter transactions or a pooler." },
  "08007": { status: 503, code: "DB_TX_RESOLUTION_UNKNOWN", message: "Transaction resolution unknown",
    category: "infrastructure", retryable: true,
    explanation: "The connection dropped during COMMIT — you don't know if it committed.",
    example: "Network blip exactly during a COMMIT statement.",
    remediation: "Reconcile state before retrying to avoid duplicates." },
  "08P01": { status: 503, code: "DB_PROTOCOL_VIOLATION", message: "Database protocol violation",
    category: "infrastructure", retryable: false,
    explanation: "Client and server speak incompatible protocol versions.",
    example: "Ancient pg client against a newer Postgres.",
    remediation: "Upgrade the pg driver." },

  // ── Class 09 — Triggered Action ──────────────────────────────────────────
  "09000": { status: 500, code: "TRIGGERED_ACTION_ERROR", message: "Triggered action exception",
    category: "developer", retryable: false,
    explanation: "A trigger function on the table raised an error.",
    example: "An audit trigger rejected an update to created_at.",
    remediation: "Fix the trigger logic." },

  // ── Class 0A — Feature Not Supported ─────────────────────────────────────
  "0A000": { status: 501, code: "FEATURE_NOT_SUPPORTED", message: "Feature not supported by the database",
    category: "developer", retryable: false,
    explanation: "You asked Postgres to do something it doesn't support here.",
    example: "LISTEN/NOTIFY on a pooled endpoint that strips it.",
    remediation: "Remove or replace the unsupported feature." },

  // ── Class 0B / 0F / 0L / 0P / 0Z — misc ──────────────────────────────────
  "0B000": { status: 500, code: "INVALID_TX_INITIATION", message: "Invalid transaction initiation",
    category: "developer", retryable: false,
    explanation: "Tried to start an invalid transaction.", example: "Nested BEGIN misused.",
    remediation: "Fix transaction control flow." },
  "0F000": { status: 403, code: "LOCATOR_EXCEPTION", message: "Locator exception",
    category: "developer", retryable: false,
    explanation: "Problem with a large-object locator reference.",
    example: "Stale locator for a large object.", remediation: "Re-fetch the locator." },
  "0L000": { status: 403, code: "INVALID_GRANTOR", message: "Invalid grantor",
    category: "developer", retryable: false,
    explanation: "A GRANT was issued by a role not allowed to grant.",
    example: "App role tried to grant privileges it doesn't own.",
    remediation: "Perform grants as owner/superuser." },
  "0P000": { status: 403, code: "INVALID_ROLE_SPECIFICATION", message: "Invalid role specification",
    category: "developer", retryable: false,
    explanation: "A role name referenced doesn't exist.",
    example: "Typo in a SET ROLE statement.", remediation: "Verify the role name." },
  "0Z000": { status: 500, code: "DIAGNOSTICS_EXCEPTION", message: "Diagnostics exception",
    category: "developer", retryable: false,
    explanation: "Internal diagnostics error.", example: "Rare — usually a Postgres bug.",
    remediation: "Report to Postgres maintainers if reproducible." },

  // ── Class 20 — Case Not Found ────────────────────────────────────────────
  "20000": { status: 500, code: "CASE_NOT_FOUND", message: "Case not found",
    category: "developer", retryable: false,
    explanation: "A CASE statement in PL/pgSQL had no matching branch and no ELSE.",
    example: "CASE WHEN ... END; with no fallback.", remediation: "Add an ELSE branch." },

  // ── Class 21 — Cardinality Violation ─────────────────────────────────────
  "21000": { status: 400, code: "CARDINALITY_VIOLATION", message: "Cardinality violation",
    category: "developer", retryable: false,
    explanation: "Expected one row but got many.",
    example: "Scalar subquery returned 3 rows in a 1-value context.",
    remediation: "Rewrite query to return a single value." },

  // ── Class 22 — Data Exception ────────────────────────────────────────────
  "22000": { status: 400, code: "DATA_EXCEPTION", message: "Data exception",
    category: "client_input", retryable: false,
    explanation: "The data doesn't match what the column expects.",
    example: "Generic data mismatch.", remediation: "Validate the input." },
  "22001": { status: 400, code: "STRING_DATA_TOO_LONG", message: "Value exceeds maximum length for column",
    category: "client_input", retryable: false,
    explanation: "The string you sent is longer than the column allows.",
    example: "VARCHAR(50) username, user typed 200 characters.",
    remediation: "Validate max lengths on client and server." },
  "22003": { status: 400, code: "NUMERIC_OUT_OF_RANGE", message: "Numeric value out of range",
    category: "client_input", retryable: false,
    explanation: "The number is outside the allowed range for the column.",
    example: "INTEGER column, tried to store 5,000,000,000.",
    remediation: "Validate numeric ranges before insert." },
  "22004": { status: 400, code: "NULL_VALUE_NOT_ALLOWED", message: "Null value not allowed",
    category: "client_input", retryable: false,
    explanation: "A NULL was passed where a value is required.",
    example: "Passing null to a function parameter marked NOT NULL.",
    remediation: "Provide a value." },
  "22007": { status: 400, code: "INVALID_DATETIME_FORMAT", message: "Invalid datetime format",
    category: "client_input", retryable: false,
    explanation: "The date/time string couldn't be parsed.",
    example: "Client sent '2024-13-45'.", remediation: "Validate dates on client + use ISO 8601." },
  "22008": { status: 400, code: "DATETIME_FIELD_OVERFLOW", message: "Datetime field overflow",
    category: "client_input", retryable: false,
    explanation: "The date is outside the supported range for the column type.",
    example: "Year 100,000 into a DATE column.", remediation: "Bound the input range." },
  "22012": { status: 400, code: "DIVISION_BY_ZERO", message: "Division by zero",
    category: "developer", retryable: false,
    explanation: "A query tried to divide by zero.",
    example: "SELECT price / discount where discount = 0.",
    remediation: "Guard the divisor (NULLIF(discount, 0))." },
  "22018": { status: 400, code: "INVALID_CHARACTER_VALUE", message: "Invalid character value for cast",
    category: "client_input", retryable: false,
    explanation: "Tried to cast text to a type it doesn't represent.",
    example: "CAST('hello' AS INTEGER).", remediation: "Validate type before casting." },
  "22023": { status: 400, code: "INVALID_PARAMETER_VALUE", message: "Invalid parameter value",
    category: "developer", retryable: false,
    explanation: "A bad argument was passed to a Postgres function.",
    example: "make_interval(mins => -5).", remediation: "Validate arguments." },
  "22025": { status: 400, code: "INVALID_ESCAPE_SEQUENCE", message: "Invalid escape sequence",
    category: "client_input", retryable: false,
    explanation: "LIKE/ILIKE pattern has a bad escape sequence.",
    example: "LIKE 'abc\\xyz'.", remediation: "Escape or use parameterized input." },
  "22P01": { status: 400, code: "FLOATING_POINT_EXCEPTION", message: "Floating point exception",
    category: "developer", retryable: false,
    explanation: "NaN or Infinity where not allowed.",
    example: "0.0/0.0 result inserted into NUMERIC.", remediation: "Guard against NaN." },
  "22P02": { status: 400, code: "INVALID_TEXT_REPRESENTATION", message: "Invalid input syntax",
    category: "client_input", retryable: false,
    explanation: "You sent text that can't be parsed as the target type.",
    example: "'abc' into a UUID column.", remediation: "Validate format before querying." },
  "22P03": { status: 400, code: "INVALID_BINARY_REPRESENTATION", message: "Invalid binary representation",
    category: "client_input", retryable: false,
    explanation: "Malformed bytea/binary data.", example: "Corrupted bytea upload.",
    remediation: "Re-encode binary data." },
  "22P04": { status: 400, code: "BAD_COPY_FILE_FORMAT", message: "Bad COPY file format",
    category: "client_input", retryable: false,
    explanation: "Bulk import file has wrong column count/format.",
    example: "CSV with 5 columns into a 4-column table.",
    remediation: "Fix the import file." },
  "22P05": { status: 400, code: "UNTRANSLATABLE_CHARACTER", message: "Untranslatable character",
    category: "client_input", retryable: false,
    explanation: "A character couldn't be encoded in the target charset.",
    example: "Emoji into a LATIN1 column.", remediation: "Use UTF-8 columns." },
  "22P06": { status: 400, code: "NONSTANDARD_ESCAPE", message: "Nonstandard use of escape character",
    category: "developer", retryable: false,
    explanation: "Old backslash escape syntax used where it's deprecated.",
    example: "LIKE '100%' with standard_conforming_strings on.",
    remediation: "Use standard escape syntax." },

  // ── Class 23 — Integrity Constraint Violation ────────────────────────────
  "23000": { status: 409, code: "INTEGRITY_VIOLATION", message: "Integrity constraint violation",
    category: "conflict", retryable: false,
    explanation: "The data violates a constraint on the table.",
    example: "Generic constraint failure.", remediation: "Return the violating field to the user." },
  "23001": { status: 409, code: "RESTRICT_VIOLATION", message: "Restrict violation",
    category: "conflict", retryable: false,
    explanation: "You tried to delete/modify a parent row that children still reference.",
    example: "Deleting a user with ON DELETE RESTRICT orders.",
    remediation: "Delete children first or change FK action." },
  "23502": { status: 400, code: "NOT_NULL_VIOLATION", message: "Required field cannot be null",
    category: "client_input", retryable: false,
    explanation: "A NOT NULL column didn't receive a value.",
    example: "Signup request missing email.", remediation: "Validate required fields on client." },
  "23503": { status: 400, code: "FOREIGN_KEY_VIOLATION", message: "Referenced record does not exist",
    category: "client_input", retryable: false,
    explanation: "The foreign key you sent points to a row that doesn't exist.",
    example: "Creating an order with user_id = 999.", remediation: "Verify referenced IDs exist." },
  "23505": { status: 409, code: "UNIQUE_VIOLATION", message: "Duplicate entry — value already in use",
    category: "conflict", retryable: false,
    explanation: "You tried to insert/update a value that must be unique but already exists.",
    example: "Signing up with an email that's already registered.",
    remediation: "Ask user for a different value, or use ON CONFLICT." },
  "23514": { status: 400, code: "CHECK_VIOLATION", message: "Check constraint violated",
    category: "client_input", retryable: false,
    explanation: "The value fails a CHECK rule on the table.",
    example: "age = 12 where CHECK (age >= 18).", remediation: "Validate against the rule." },
  "23P01": { status: 409, code: "EXCLUSION_VIOLATION", message: "Exclusion constraint violated",
    category: "conflict", retryable: false,
    explanation: "Two rows can't coexist because of an EXCLUDE constraint.",
    example: "Overlapping bookings on the same room.",
    remediation: "Pick a non-overlapping value." },

  // ── Class 24 — Invalid Cursor State ──────────────────────────────────────
  "24000": { status: 500, code: "INVALID_CURSOR_STATE", message: "Invalid cursor state",
    category: "developer", retryable: false,
    explanation: "A cursor was used while not open.",
    example: "Old code paths using explicit cursors.", remediation: "Fix cursor lifecycle." },

  // ── Class 25 — Invalid Transaction State ─────────────────────────────────
  "25000": { status: 500, code: "INVALID_TX_STATE", message: "Invalid transaction state",
    category: "developer", retryable: false,
    explanation: "Transaction used in an invalid sequence.",
    example: "Generic transaction state bug.", remediation: "Fix transaction wrapper." },
  "25001": { status: 500, code: "ACTIVE_SQL_TRANSACTION", message: "Active SQL transaction",
    category: "developer", retryable: false,
    explanation: "BEGIN called while a transaction is already open.",
    example: "Nested BEGIN without savepoint.", remediation: "Use savepoints for nesting." },
  "25002": { status: 500, code: "BRANCH_TX_ALREADY_ACTIVE", message: "Branch transaction already active",
    category: "developer", retryable: false,
    explanation: "Savepoint branch already active.", example: "Duplicate savepoint logic.",
    remediation: "Fix savepoint naming." },
  "25003": { status: 500, code: "INAPPROPRIATE_ACCESS_MODE", message: "Inappropriate access mode",
    category: "developer", retryable: false,
    explanation: "Tried to write inside a read-only transaction.",
    example: "INSERT against a Neon read replica.",
    remediation: "Route writes to the primary." },
  "25004": { status: 500, code: "INAPPROPRIATE_ISOLATION_LEVEL", message: "Inappropriate isolation level",
    category: "developer", retryable: false,
    explanation: "Isolation level not allowed here.",
    example: "SERIALIZABLE inside a specific context.", remediation: "Adjust isolation level." },
  "25005": { status: 500, code: "NO_ACTIVE_SQL_TRANSACTION", message: "No active SQL transaction",
    category: "developer", retryable: false,
    explanation: "COMMIT/ROLLBACK without an open transaction.",
    example: "Double-commit bug.", remediation: "Guard with transaction state." },
  "25006": { status: 500, code: "READ_ONLY_SQL_TRANSACTION", message: "Read-only SQL transaction",
    category: "developer", retryable: false,
    explanation: "Write attempted in a read-only transaction.",
    example: "INSERT after SET TRANSACTION READ ONLY.", remediation: "Only run SELECT." },
  "25P01": { status: 500, code: "NO_ACTIVE_SQL_TX", message: "No active SQL transaction",
    category: "developer", retryable: false,
    explanation: "Same as 25005.", example: "Misuse of COMMIT.", remediation: "Fix txn flow." },
  "25P02": { status: 500, code: "IN_FAILED_SQL_TX", message: "Transaction is aborted",
    category: "developer", retryable: false,
    explanation: "A previous statement in the transaction failed; you must ROLLBACK before continuing.",
    example: "Error inside txn, then kept issuing queries.", remediation: "Always ROLLBACK on failure." },
  "25P03": { status: 504, code: "IDLE_IN_TX_TIMEOUT", message: "Idle-in-transaction timeout",
    category: "infrastructure", retryable: true,
    explanation: "A transaction stayed idle too long and was killed.",
    example: "Serverless function held a txn open for 60s.",
    remediation: "Keep transactions short; use pooler." },

  // ── Class 26–3F — misc structural ────────────────────────────────────────
  "26000": { status: 500, code: "INVALID_SQL_STATEMENT_NAME", message: "Invalid SQL statement name",
    category: "developer", retryable: false,
    explanation: "Referenced a prepared statement that doesn't exist.",
    example: "Name typo in a DEALLOCATE.", remediation: "Fix the statement name." },
  "27000": { status: 409, code: "TRIGGERED_DATA_CHANGE", message: "Triggered data change violation",
    category: "developer", retryable: false,
    explanation: "A trigger attempted a change that violates a rule.",
    example: "Trigger updating a read-only view.", remediation: "Fix trigger logic." },
  "28000": { status: 401, code: "INVALID_AUTHORIZATION", message: "Invalid authorization specification",
    category: "auth", retryable: false,
    explanation: "Bad role or user in the connection.",
    example: "Wrong user in DATABASE_URL.", remediation: "Fix credentials." },
  "28P01": { status: 401, code: "INVALID_PASSWORD", message: "Invalid database password",
    category: "auth", retryable: false,
    explanation: "Wrong password for the DB user.",
    example: "Rotated password not updated.", remediation: "Rotate and update env var." },
  "2B000": { status: 409, code: "DEPENDENT_PRIVILEGES_EXIST", message: "Dependent privileges still exist",
    category: "developer", retryable: false,
    explanation: "Cannot drop a role that still owns objects.",
    example: "DROP ROLE while owning tables.", remediation: "Reassign/drop objects first." },
  "2D000": { status: 500, code: "INVALID_TX_TERMINATION", message: "Invalid transaction termination",
    category: "developer", retryable: false,
    explanation: "Nested transaction ended incorrectly.", example: "Bug in nested txn handling.",
    remediation: "Use savepoints." },
  "2F000": { status: 500, code: "SQL_ROUTINE_EXCEPTION", message: "SQL routine exception",
    category: "developer", retryable: false,
    explanation: "Stored procedure hit an exception.",
    example: "Bug inside a PL/pgSQL function.", remediation: "Debug the routine." },
  "34000": { status: 500, code: "INVALID_CURSOR_NAME", message: "Invalid cursor name",
    category: "developer", retryable: false,
    explanation: "Referenced a cursor that doesn't exist.", example: "Typo in cursor name.",
    remediation: "Fix name." },
  "38000": { status: 500, code: "EXTERNAL_ROUTINE_EXCEPTION", message: "External routine exception",
    category: "developer", retryable: false,
    explanation: "A C extension raised an error.", example: "Buggy extension.",
    remediation: "Update or remove extension." },
  "39000": { status: 500, code: "EXTERNAL_ROUTINE_INVOCATION", message: "External routine invocation exception",
    category: "developer", retryable: false,
    explanation: "Same family as 38000.", example: "Extension invocation failure.",
    remediation: "Check extension config." },
  "3B000": { status: 500, code: "SAVEPOINT_EXCEPTION", message: "Savepoint exception",
    category: "developer", retryable: false,
    explanation: "Savepoint doesn't exist.", example: "ROLLBACK TO nonexistent savepoint.",
    remediation: "Fix savepoint names." },
  "3D000": { status: 500, code: "INVALID_CATALOG_NAME", message: "Invalid catalog name",
    category: "developer", retryable: false,
    explanation: "Database doesn't exist.", example: "Typo in DB name.",
    remediation: "Fix DATABASE_URL." },
  "3F000": { status: 500, code: "INVALID_SCHEMA_NAME", message: "Invalid schema name",
    category: "developer", retryable: false,
    explanation: "Schema doesn't exist.", example: "Missing CREATE SCHEMA before search_path.",
    remediation: "Create schema or fix search_path." },

  // ── Class 40 — Transaction Rollback ──────────────────────────────────────
  "40000": { status: 409, code: "TX_ROLLBACK", message: "Transaction rollback",
    category: "retryable", retryable: true,
    explanation: "Postgres rolled back the transaction (generic).",
    example: "Rollback triggered by a constraint.", remediation: "Retry if safe." },
  "40001": { status: 409, code: "SERIALIZATION_FAILURE", message: "Serialization failure — please retry",
    category: "retryable", retryable: true,
    explanation: "Two SERIALIZABLE transactions conflicted; yours was aborted.",
    example: "Concurrent balance updates.", remediation: "Retry the whole transaction." },
  "40002": { status: 409, code: "TX_INTEGRITY_VIOLATION", message: "Transaction integrity constraint violation",
    category: "conflict", retryable: false,
    explanation: "Deferred constraint violated at COMMIT time.",
    example: "DEFERRABLE FK checked only on commit.", remediation: "Fix data before commit." },
  "40003": { status: 500, code: "STATEMENT_COMPLETION_UNKNOWN", message: "Statement completion unknown",
    category: "infrastructure", retryable: true,
    explanation: "Connection dropped mid-commit; outcome unknown.",
    example: "Network blip during COMMIT.", remediation: "Reconcile before retry." },
  "40P01": { status: 409, code: "DEADLOCK_DETECTED", message: "Deadlock detected — please retry",
    category: "retryable", retryable: true,
    explanation: "Two transactions locked rows in opposite order; Postgres killed one.",
    example: "Two concurrent transfers between same accounts.",
    remediation: "Retry. Also lock rows in a consistent order." },

  // ── Class 42 — Syntax / Access Rule ──────────────────────────────────────
  "42000": { status: 400, code: "SYNTAX_ERROR_OR_ACCESS_RULE", message: "Syntax error or access rule violation",
    category: "developer", retryable: false,
    explanation: "SQL is malformed or you lack permission.",
    example: "Generic syntax failure.", remediation: "Fix the query." },
  "42501": { status: 403, code: "INSUFFICIENT_PRIVILEGE", message: "Insufficient database privilege",
    category: "auth", retryable: false,
    explanation: "The DB role lacks permission for this action.",
    example: "Read-only role trying INSERT.", remediation: "Grant privilege or use correct role." },
  "42601": { status: 500, code: "SYNTAX_ERROR", message: "SQL syntax error",
    category: "developer", retryable: false,
    explanation: "SQL has a syntax mistake.",
    example: "SELCT * FROM users.", remediation: "Fix the query. Log it." },
  "42602": { status: 500, code: "INVALID_NAME", message: "Invalid database identifier",
    category: "developer", retryable: false,
    explanation: "Identifier contains invalid characters.", example: "Quoted weird name.",
    remediation: "Use quoted identifiers or rename." },
  "42611": { status: 500, code: "INVALID_COLUMN_DEFINITION", message: "Invalid column definition",
    category: "developer", retryable: false,
    explanation: "Bad CREATE TABLE column definition.", example: "Invalid type name.",
    remediation: "Fix migration." },
  "42622": { status: 500, code: "NAME_TOO_LONG", message: "Database identifier too long",
    category: "developer", retryable: false,
    explanation: "Identifier exceeds 63 characters.", example: "Long autogenerated index name.",
    remediation: "Shorten the name." },
  "42701": { status: 500, code: "DUPLICATE_COLUMN", message: "Duplicate column",
    category: "developer", retryable: false,
    explanation: "Same column selected twice.", example: "SELECT id, id FROM users.",
    remediation: "Fix SELECT list." },
  "42702": { status: 500, code: "AMBIGUOUS_COLUMN", message: "Ambiguous column reference",
    category: "developer", retryable: false,
    explanation: "Column exists in multiple joined tables.",
    example: "SELECT id FROM users JOIN posts.", remediation: "Qualify with table alias." },
  "42703": { status: 500, code: "UNDEFINED_COLUMN", message: "Undefined column",
    category: "developer", retryable: false,
    explanation: "Column name doesn't exist.",
    example: "SELECT emial FROM users.", remediation: "Fix typo/schema." },
  "42704": { status: 500, code: "UNDEFINED_OBJECT", message: "Undefined object",
    category: "developer", retryable: false,
    explanation: "Referenced object (type, role, etc.) doesn't exist.",
    example: "Missing enum type.", remediation: "Create the object." },
  "42710": { status: 500, code: "DUPLICATE_OBJECT", message: "Duplicate object",
    category: "developer", retryable: false,
    explanation: "Object with that name already exists.",
    example: "CREATE TABLE twice.", remediation: "Use IF NOT EXISTS." },
  "42712": { status: 500, code: "DUPLICATE_ALIAS", message: "Duplicate alias",
    category: "developer", retryable: false,
    explanation: "Same alias used twice.",
    example: "FROM users u, posts u.", remediation: "Rename alias." },
  "42723": { status: 500, code: "DUPLICATE_FUNCTION", message: "Duplicate function",
    category: "developer", retryable: false,
    explanation: "Same function signature defined twice.", example: "Duplicate migration.",
    remediation: "Remove duplicate." },
  "42803": { status: 500, code: "GROUPING_ERROR", message: "Grouping error",
    category: "developer", retryable: false,
    explanation: "SELECT column not in GROUP BY.",
    example: "SELECT name, COUNT(*) FROM users.", remediation: "Add GROUP BY name." },
  "42804": { status: 500, code: "DATATYPE_MISMATCH", message: "Datatype mismatch",
    category: "developer", retryable: false,
    explanation: "Types don't match in UNION/CASE/etc.",
    example: "UNION of INT and TEXT.", remediation: "Cast consistently." },
  "42809": { status: 500, code: "WRONG_OBJECT_TYPE", message: "Wrong object type",
    category: "developer", retryable: false,
    explanation: "Object used as the wrong kind.",
    example: "Calling a table like a function.", remediation: "Fix usage." },
  "42830": { status: 500, code: "INVALID_FOREIGN_KEY", message: "Invalid foreign key",
    category: "developer", retryable: false,
    explanation: "FK references non-unique column.",
    example: "FOREIGN KEY to a non-unique column.", remediation: "Add UNIQUE on target." },
  "42846": { status: 500, code: "CANNOT_COERCE", message: "Cannot coerce types",
    category: "developer", retryable: false,
    explanation: "Implicit cast not possible.",
    example: "text → uuid directly.", remediation: "Use explicit ::cast or validate." },
  "42883": { status: 500, code: "UNDEFINED_FUNCTION", message: "Undefined function",
    category: "developer", retryable: false,
    explanation: "Function name/arity doesn't exist.",
    example: "LEN(name) instead of LENGTH(name).", remediation: "Fix function name/args." },
  "42939": { status: 500, code: "RESERVED_NAME", message: "Reserved name",
    category: "developer", retryable: false,
    explanation: "Used a reserved word as identifier.",
    example: "Table named user.", remediation: "Quote or rename." },
  "42P01": { status: 500, code: "UNDEFINED_TABLE", message: "Undefined table",
    category: "developer", retryable: false,
    explanation: "Table doesn't exist.",
    example: "SELECT * FROM userz.", remediation: "Check migrations/schema." },
  "42P02": { status: 500, code: "UNDEFINED_PARAMETER", message: "Undefined parameter",
    category: "developer", retryable: false,
    explanation: "Referenced parameter doesn't exist.", example: "Typo in $1/$2 usage.",
    remediation: "Fix parameter binding." },
  "42P03": { status: 500, code: "DUPLICATE_CURSOR", message: "Duplicate cursor",
    category: "developer", retryable: false,
    explanation: "Cursor name already used.", example: "Same cursor declared twice.",
    remediation: "Rename cursor." },
  "42P04": { status: 500, code: "DUPLICATE_DATABASE", message: "Duplicate database",
    category: "developer", retryable: false,
    explanation: "Database already exists.", example: "CREATE DATABASE twice.",
    remediation: "Guard with IF NOT EXISTS." },
  "42P05": { status: 500, code: "DUPLICATE_PREPARED_STMT", message: "Duplicate prepared statement",
    category: "developer", retryable: false,
    explanation: "Prepared statement name reused.", example: "Two PREPARE with same name.",
    remediation: "Rename or DEALLOCATE." },
  "42P06": { status: 500, code: "DUPLICATE_SCHEMA", message: "Duplicate schema",
    category: "developer", retryable: false,
    explanation: "Schema already exists.", example: "CREATE SCHEMA twice.",
    remediation: "IF NOT EXISTS." },
  "42P07": { status: 500, code: "DUPLICATE_TABLE", message: "Duplicate table",
    category: "developer", retryable: false,
    explanation: "Table already exists.", example: "Re-running migration.",
    remediation: "Idempotent migrations." },
  "42P08": { status: 500, code: "AMBIGUOUS_PARAMETER", message: "Ambiguous parameter",
    category: "developer", retryable: false,
    explanation: "Parameter type inferred multiple ways.", example: "Unclear $1 type.",
    remediation: "Cast explicitly." },
  "42P09": { status: 500, code: "AMBIGUOUS_ALIAS", message: "Ambiguous alias",
    category: "developer", retryable: false,
    explanation: "Alias appears in multiple FROM sources.", example: "Same alias twice.",
    remediation: "Rename." },
  "42P10": { status: 500, code: "INVALID_COLUMN_REFERENCE", message: "Invalid column reference",
    category: "developer", retryable: false,
    explanation: "Column reference invalid in context.", example: "Wrong WHERE scope.",
    remediation: "Fix reference." },
  "42P11": { status: 500, code: "INVALID_CURSOR_DEFINITION", message: "Invalid cursor definition",
    category: "developer", retryable: false,
    explanation: "Bad cursor declaration.", example: "Syntax error in DECLARE CURSOR.",
    remediation: "Fix declaration." },
  "42P12": { status: 500, code: "INVALID_DB_DEFINITION", message: "Invalid database definition",
    category: "developer", retryable: false,
    explanation: "Bad CREATE DATABASE options.", example: "Invalid locale.",
    remediation: "Fix options." },
  "42P13": { status: 500, code: "INVALID_FUNCTION_DEFINITION", message: "Invalid function definition",
    category: "developer", retryable: false,
    explanation: "CREATE FUNCTION is malformed.", example: "Wrong return type.",
    remediation: "Fix definition." },
  "42P14": { status: 500, code: "INVALID_PREPARED_STMT_DEF", message: "Invalid prepared statement definition",
    category: "developer", retryable: false,
    explanation: "Bad PREPARE syntax.", example: "Placeholder mismatch.",
    remediation: "Fix PREPARE." },
  "42P15": { status: 500, code: "INVALID_SCHEMA_DEFINITION", message: "Invalid schema definition",
    category: "developer", retryable: false,
    explanation: "Bad CREATE SCHEMA options.", example: "Invalid authorization.",
    remediation: "Fix definition." },
  "42P16": { status: 500, code: "INVALID_TABLE_DEFINITION", message: "Invalid table definition",
    category: "developer", retryable: false,
    explanation: "Bad CREATE TABLE options.", example: "Bad partition clause.",
    remediation: "Fix definition." },
  "42P17": { status: 500, code: "INVALID_OBJECT_DEFINITION", message: "Invalid object definition",
    category: "developer", retryable: false,
    explanation: "Object definition invalid.", example: "Bad object options.",
    remediation: "Fix definition." },
  "42P18": { status: 500, code: "INDETERMINATE_DATATYPE", message: "Indeterminate datatype",
    category: "developer", retryable: false,
    explanation: "Type can't be determined from context.", example: "Unclear NULL type.",
    remediation: "Cast explicitly." },
  "42P19": { status: 500, code: "INVALID_RECURSION", message: "Invalid recursion",
    category: "developer", retryable: false,
    explanation: "Recursive CTE is malformed.", example: "Missing UNION ALL.",
    remediation: "Fix CTE." },
  "42P20": { status: 500, code: "WINDOWING_ERROR", message: "Windowing error",
    category: "developer", retryable: false,
    explanation: "Bad window function usage.", example: "OVER () misuse.",
    remediation: "Fix window clause." },
  "42P21": { status: 500, code: "COLLATION_MISMATCH", message: "Collation mismatch",
    category: "developer", retryable: false,
    explanation: "Two collations don't match.", example: "Comparing differently collated columns.",
    remediation: "Add COLLATE clause." },
  "42P22": { status: 500, code: "INDETERMINATE_COLLATION", message: "Indeterminate collation",
    category: "developer", retryable: false,
    explanation: "Collation can't be inferred.", example: "Ambiguous ORDER BY.",
    remediation: "Add explicit COLLATE." },

  // ── Class 44 — WITH CHECK OPTION ─────────────────────────────────────────
  "44000": { status: 400, code: "WITH_CHECK_OPTION_VIOLATION", message: "WITH CHECK OPTION violated",
    category: "client_input", retryable: false,
    explanation: "Row violates a view's WITH CHECK OPTION.",
    example: "Insert filtered out by a view's WHERE.",
    remediation: "Adjust the input to fit the view's filter." },

  // ── Class 53 — Insufficient Resources ────────────────────────────────────
  "53000": { status: 503, code: "INSUFFICIENT_RESOURCES", message: "Insufficient resources",
    category: "infrastructure", retryable: true,
    explanation: "Server ran out of a resource.", example: "Memory/CPU limits.",
    remediation: "Scale up / retry." },
  "53100": { status: 507, code: "DISK_FULL", message: "Disk full",
    category: "infrastructure", retryable: false,
    explanation: "Storage is full.", example: "Neon storage exhausted.",
    remediation: "Free space / upgrade plan." },
  "53200": { status: 503, code: "OUT_OF_MEMORY", message: "Out of memory",
    category: "infrastructure", retryable: true,
    explanation: "A query used more RAM than available.",
    example: "Huge ORDER BY on a big table.", remediation: "Add index or paginate." },
  "53300": { status: 503, code: "TOO_MANY_CONNECTIONS", message: "Too many database connections",
    category: "infrastructure", retryable: true,
    explanation: "Connection limit reached.",
    example: "Serverless bursting, no pooler.", remediation: "Use Neon pooler / reduce pool size." },
  "53400": { status: 503, code: "CONFIG_LIMIT_EXCEEDED", message: "Configuration limit exceeded",
    category: "infrastructure", retryable: false,
    explanation: "A Postgres config limit was hit.",
    example: "max_locks_per_transaction exceeded.", remediation: "Tune config or reduce load." },

  // ── Class 54 — Program Limit Exceeded ────────────────────────────────────
  "54000": { status: 400, code: "PROGRAM_LIMIT_EXCEEDED", message: "Program limit exceeded",
    category: "developer", retryable: false,
    explanation: "Query hit a hard Postgres limit.", example: "Nested too deep.",
    remediation: "Rewrite query." },
  "54001": { status: 400, code: "STATEMENT_TOO_COMPLEX", message: "Statement too complex",
    category: "developer", retryable: false,
    explanation: "Query too complex to plan.",
    example: "Thousands of ORs / nested subqueries.", remediation: "Simplify." },
  "54011": { status: 400, code: "TOO_MANY_COLUMNS", message: "Too many columns",
    category: "developer", retryable: false,
    explanation: "Exceeded max column count.", example: "SELECT with 1700+ columns.",
    remediation: "Select only what you need." },
  "54023": { status: 400, code: "TOO_MANY_ARGUMENTS", message: "Too many arguments",
    category: "developer", retryable: false,
    explanation: "Too many args to a function.",
    example: "generate_series with too many dims.", remediation: "Reduce args." },

  // ── Class 55 — Object Not In Prerequisite State ──────────────────────────
  "55000": { status: 409, code: "OBJECT_NOT_IN_PREREQUISITE_STATE", message: "Object not in prerequisite state",
    category: "conflict", retryable: false,
    explanation: "Object is in a state that blocks the operation.",
    example: "Index still building.", remediation: "Wait / retry." },
  "55006": { status: 409, code: "OBJECT_IN_USE", message: "Object in use",
    category: "conflict", retryable: true,
    explanation: "Object is being used by someone else.",
    example: "DROP DATABASE while connected.", remediation: "Disconnect first." },
  "55P02": { status: 400, code: "CANT_CHANGE_RUNTIME_PARAM", message: "Cannot change runtime parameter",
    category: "developer", retryable: false,
    explanation: "Parameter needs a restart to change.",
    example: "SET shared_buffers.", remediation: "Change config + restart." },
  "55P03": { status: 409, code: "LOCK_NOT_AVAILABLE", message: "Lock not available",
    category: "conflict", retryable: true,
    explanation: "Row lock not available (FOR UPDATE NOWAIT).",
    example: "Job queue SKIP LOCKED misuse.", remediation: "Retry with backoff." },
  "55P04": { status: 409, code: "UNSAFE_NEW_ENUM_VALUE", message: "Unsafe use of new enum value",
    category: "developer", retryable: false,
    explanation: "New enum value used in same txn it was added.",
    example: "ALTER TYPE + INSERT in one txn.", remediation: "Split into two transactions." },

  // ── Class 57 — Operator Intervention ─────────────────────────────────────
  "57000": { status: 503, code: "OPERATOR_INTERVENTION", message: "Operator intervention",
    category: "infrastructure", retryable: true,
    explanation: "A human/system killed the query or backend.",
    example: "Admin terminated the session.", remediation: "Retry." },
  "57014": { status: 504, code: "QUERY_CANCELED", message: "Query canceled",
    category: "retryable", retryable: true,
    explanation: "Query was canceled — usually a statement timeout.",
    example: "Long query > statement_timeout.", remediation: "Optimize query or raise timeout." },
  "57P01": { status: 503, code: "ADMIN_SHUTDOWN", message: "Database admin shutdown",
    category: "infrastructure", retryable: true,
    explanation: "Admin shut down the backend.",
    example: "Neon maintenance.", remediation: "Retry." },
  "57P02": { status: 503, code: "CRASH_SHUTDOWN", message: "Database crash shutdown",
    category: "infrastructure", retryable: true,
    explanation: "Postgres crashed.", example: "OOM kill.",
    remediation: "Retry + alert ops." },
  "57P03": { status: 503, code: "CANNOT_CONNECT_NOW", message: "Cannot connect to database now",
    category: "infrastructure", retryable: true,
    explanation: "Server is starting up or shutting down.",
    example: "Neon cold start.", remediation: "Retry with backoff." },
  "57P04": { status: 503, code: "DATABASE_DROPPED", message: "Database dropped",
    category: "infrastructure", retryable: false,
    explanation: "The database you're connected to was dropped.",
    example: "Accidental DROP DATABASE.", remediation: "Reconnect to the new DB." },

  // ── Class 58 — System Error ──────────────────────────────────────────────
  "58000": { status: 500, code: "SYSTEM_ERROR", message: "Database system error",
    category: "infrastructure", retryable: true,
    explanation: "OS/filesystem level failure inside Postgres.",
    example: "Kernel issue.", remediation: "Alert ops." },
  "58030": { status: 500, code: "IO_ERROR", message: "Database I/O error",
    category: "infrastructure", retryable: true,
    explanation: "Disk read/write failed.", example: "Bad storage.",
    remediation: "Alert ops." },

  // ── Class 72 — Snapshot Failure ──────────────────────────────────────────
  "72000": { status: 500, code: "SNAPSHOT_TOO_OLD", message: "Snapshot too old",
    category: "infrastructure", retryable: true,
    explanation: "Long query needed a snapshot that's been vacuumed.",
    example: "Long analytics query on busy OLTP.",
    remediation: "Run on replica / shorter query." },

  // ── Class F0 / HV / P0 / XX ──────────────────────────────────────────────
  "F0000": { status: 500, code: "CONFIG_FILE_ERROR", message: "Configuration file error",
    category: "infrastructure", retryable: false,
    explanation: "Postgres config file is invalid.", example: "Bad postgresql.conf.",
    remediation: "Fix config + reload." },
  "HV000": { status: 500, code: "FDW_ERROR", message: "Foreign data wrapper error",
    category: "infrastructure", retryable: false,
    explanation: "Foreign data wrapper failed.",
    example: "postgres_fdw remote query failed.", remediation: "Check remote DB." },
  "P0000": { status: 500, code: "PLPGSQL_ERROR", message: "PL/pgSQL error",
    category: "developer", retryable: false,
    explanation: "Bug in a stored procedure.", example: "Unhandled branch.",
    remediation: "Debug routine." },
  "P0001": { status: 400, code: "RAISE_EXCEPTION", message: "Raised exception",
    category: "client_input", retryable: false,
    explanation: "Your own function/trigger called RAISE EXCEPTION.",
    example: "RAISE EXCEPTION 'Invalid coupon' inside a trigger.",
    remediation: "Treat as a business-rule violation; show the message." },
  "P0002": { status: 404, code: "NO_DATA_FOUND", message: "No data found",
    category: "client_input", retryable: false,
    explanation: "SELECT INTO STRICT found nothing.",
    example: "Expecting exactly one row, got zero.", remediation: "Handle empty case." },
  "P0003": { status: 400, code: "TOO_MANY_ROWS", message: "Too many rows",
    category: "client_input", retryable: false,
    explanation: "SELECT INTO STRICT found more than one row.",
    example: "Expected one row, got many.", remediation: "Add LIMIT or fix filter." },
  "P0004": { status: 400, code: "ASSERT_FAILURE", message: "Assert failure",
    category: "developer", retryable: false,
    explanation: "ASSERT inside PL/pgSQL failed.",
    example: "Invariant broken.", remediation: "Debug function." },
  "XX000": { status: 500, code: "INTERNAL_DB_ERROR", message: "Internal database error",
    category: "infrastructure", retryable: true,
    explanation: "Postgres internal error (usually a bug).",
    example: "Assertion inside engine.", remediation: "Retry + report to Postgres team." },
  "XX001": { status: 500, code: "DATA_CORRUPTED", message: "Data corrupted",
    category: "infrastructure", retryable: false,
    explanation: "Physical data corruption.", example: "Bad sector.",
    remediation: "Restore from backup." },
  "XX002": { status: 500, code: "INDEX_CORRUPTED", message: "Index corrupted",
    category: "infrastructure", retryable: false,
    explanation: "Index corrupted.",
    example: "Bug or hardware failure.", remediation: "REINDEX." },
};

// ─────────────────────────────────────────────────────────────────────────────
// Node / network errors
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_ERRORS = {
  ECONNREFUSED:  { status: 503, code: "CONNECTION_REFUSED",   message: "Service refused the connection",
    category: "infrastructure", retryable: true,
    explanation: "The remote host is not accepting connections.",
    example: "DB port closed / firewall.", remediation: "Retry with backoff." },
  ECONNRESET:    { status: 502, code: "CONNECTION_RESET",     message: "Connection was reset",
    category: "infrastructure", retryable: true,
    explanation: "The remote end abruptly closed the connection.",
    example: "Proxy killed idle conn.", remediation: "Retry." },
  ECONNABORTED:  { status: 502, code: "CONNECTION_ABORTED",   message: "Connection aborted",
    category: "infrastructure", retryable: true,
    explanation: "Connection aborted locally.", example: "Local network issue.",
    remediation: "Retry." },
  EPIPE:         { status: 502, code: "BROKEN_PIPE",          message: "Broken pipe",
    category: "infrastructure", retryable: true,
    explanation: "Write to a closed socket.", example: "Peer closed early.",
    remediation: "Retry." },
  ETIMEDOUT:     { status: 504, code: "CONNECTION_TIMEOUT",   message: "Connection timed out",
    category: "infrastructure", retryable: true,
    explanation: "Connection took too long.", example: "Network slowness.",
    remediation: "Retry." },
  ENOTFOUND:     { status: 503, code: "DNS_LOOKUP_FAILED",    message: "DNS lookup failed",
    category: "infrastructure", retryable: true,
    explanation: "Hostname couldn't be resolved.",
    example: "Typo in host.", remediation: "Fix host/DNS." },
  EAI_AGAIN:     { status: 503, code: "DNS_TEMPORARY_FAILURE",message: "Temporary DNS failure",
    category: "infrastructure", retryable: true,
    explanation: "DNS lookup temporarily failed.",
    example: "DNS server hiccup.", remediation: "Retry." },
  EHOSTUNREACH:  { status: 503, code: "HOST_UNREACHABLE",     message: "Host unreachable",
    category: "infrastructure", retryable: true,
    explanation: "Host is not reachable.", example: "Routing issue.",
    remediation: "Retry." },
  ENETUNREACH:   { status: 503, code: "NETWORK_UNREACHABLE",  message: "Network unreachable",
    category: "infrastructure", retryable: true,
    explanation: "Network is unreachable.", example: "Wrong subnet.",
    remediation: "Retry." },
};

// ─────────────────────────────────────────────────────────────────────────────
// body-parser / raw-body
// ─────────────────────────────────────────────────────────────────────────────
const BODY_ERRORS = {
  "entity.parse.failed":  { status: 400, code: "MALFORMED_JSON", message: "Malformed JSON body",
    category: "client_input", retryable: false,
    explanation: "The JSON in the request body can't be parsed.",
    example: "Trailing comma or unquoted key.",
    remediation: "Send valid JSON." },
  "entity.too.large":     { status: 413, code: "PAYLOAD_TOO_LARGE", message: "Request payload too large",
    category: "client_input", retryable: false,
    explanation: "Request body exceeded the size limit.",
    example: "Uploading 50MB when limit is 1MB.",
    remediation: "Reduce payload or raise limit." },
  "entity.verify.failed": { status: 400, code: "PAYLOAD_VERIFY_FAILED", message: "Payload verification failed",
    category: "client_input", retryable: false,
    explanation: "Custom verify function rejected the payload.",
    example: "Signature mismatch.", remediation: "Re-sign or fix verification." },
  "encoding.unsupported": { status: 415, code: "UNSUPPORTED_ENCODING", message: "Unsupported content encoding",
    category: "client_input", retryable: false,
    explanation: "Content-Encoding not supported.",
    example: "Custom compression.", remediation: "Use gzip/deflate/br or none." },
  "charset.unsupported":  { status: 415, code: "UNSUPPORTED_CHARSET", message: "Unsupported charset",
    category: "client_input", retryable: false,
    explanation: "Charset not supported.", example: "Exotic charset.",
    remediation: "Use UTF-8." },
  "request.aborted":      { status: 400, code: "REQUEST_ABORTED", message: "Request aborted by client",
    category: "client_input", retryable: false,
    explanation: "Client closed the connection before sending all data.",
    example: "User closed tab.", remediation: "Nothing — informational." },
  "request.size.invalid": { status: 400, code: "INVALID_REQUEST_SIZE", message: "Request size did not match Content-Length",
    category: "client_input", retryable: false,
    explanation: "Body length didn't match the header.",
    example: "Truncated request.", remediation: "Resend complete body." },
  "parameters.too.many":  { status: 413, code: "TOO_MANY_PARAMETERS", message: "Too many parameters",
    category: "client_input", retryable: false,
    explanation: "Too many parameters in the request.",
    example: "Massive form post.", remediation: "Reduce parameters." },
};

// ─────────────────────────────────────────────────────────────────────────────
// Multer
// ─────────────────────────────────────────────────────────────────────────────
const MULTER_ERRORS = {
  LIMIT_PART_COUNT:      { status: 413, code: "TOO_MANY_PARTS", message: "Too many multipart parts",
    category: "client_input", retryable: false,
    explanation: "Multipart body has too many parts.",
    example: "Bot sending thousands of fields.", remediation: "Reduce parts." },
  LIMIT_FILE_SIZE:       { status: 413, code: "FILE_TOO_LARGE", message: "Uploaded file too large",
    category: "client_input", retryable: false,
    explanation: "Uploaded file exceeds the size limit.",
    example: "Upload 20MB avatar where limit is 2MB.", remediation: "Shrink file or raise limit." },
  LIMIT_FILE_COUNT:      { status: 413, code: "TOO_MANY_FILES", message: "Too many files uploaded",
    category: "client_input", retryable: false,
    explanation: "Too many files in one request.",
    example: "Upload 100 files when max is 10.", remediation: "Upload fewer." },
  LIMIT_FIELD_KEY:       { status: 400, code: "FIELD_NAME_TOO_LONG", message: "Field name too long",
    category: "client_input", retryable: false,
    explanation: "A multipart field name is too long.",
    example: "Very long field name.", remediation: "Shorten." },
  LIMIT_FIELD_VALUE:     { status: 413, code: "FIELD_VALUE_TOO_LONG", message: "Field value too long",
    category: "client_input", retryable: false,
    explanation: "A multipart field value is too long.",
    example: "Giant text field.", remediation: "Trim." },
  LIMIT_FIELD_COUNT:     { status: 413, code: "TOO_MANY_FIELDS", message: "Too many fields",
    category: "client_input", retryable: false,
    explanation: "Too many non-file fields.",
    example: "Huge form.", remediation: "Reduce." },
  LIMIT_UNEXPECTED_FILE: { status: 400, code: "UNEXPECTED_FILE", message: "Unexpected file field",
    category: "client_input", retryable: false,
    explanation: "Uploaded file to an unexpected field name.",
    example: "Sent 'avatar' but route expects 'file'.", remediation: "Use correct field name." },
};

// ─────────────────────────────────────────────────────────────────────────────
// Normalization
// ─────────────────────────────────────────────────────────────────────────────
function isPgError(err) {
  if (!err || typeof err.code !== "string") return false;
  return Boolean(err.severity || err.routine || err.file) || Boolean(PG_ERRORS[err.code]);
}

function extractPgDetails(err) {
  const details = {};
  if (err.constraint) details.constraint = err.constraint;
  if (err.table)      details.table      = err.table;
  if (err.column)     details.column     = err.column;
  if (!env.isProd) {
    if (err.detail) details.detail = err.detail;
    if (err.hint)   details.hint   = err.hint;
  }
  return Object.keys(details).length ? details : undefined;
}

function fromPgError(err) {
  const mapped = PG_ERRORS[err.code] || {
    status: 500,
    code: "DB_ERROR",
    message: "Database error",
    category: "unknown",
    retryable: false,
    explanation: "An unmapped database error occurred.",
    example: "Unknown SQLSTATE.",
    remediation: "Add this SQLSTATE to PG_ERRORS.",
  };
  return {
    status: mapped.status,
    code: mapped.code,
    message: mapped.message,
    details: extractPgDetails(err),
    isOperational: mapped.status < 500,
    category: mapped.category,
    retryable: mapped.retryable,
    explanation: mapped.explanation,
    example: mapped.example,
    remediation: mapped.remediation,
    source: "postgres",
    pgCode: err.code,
  };
}

function fromZod(err) {
  return {
    status: 400,
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    details: err.issues.map((i) => ({
      path: i.path.join("."),
      code: i.code,
      message: i.message,
      ...(i.expected !== undefined ? { expected: i.expected } : {}),
      ...(i.received !== undefined ? { received: i.received } : {}),
    })),
    isOperational: true,
    category: "client_input",
    retryable: false,
    explanation: "One or more fields in the request body failed schema validation.",
    example: "User submits a signup with an invalid email format.",
    remediation: "Show the per-field errors to the user.",
    source: "zod",
  };
}

function fromJwt(err) {
  if (err.name === "TokenExpiredError") {
    return {
      status: 401, code: "TOKEN_EXPIRED", message: "Authentication token has expired",
      isOperational: true, category: "auth", retryable: false,
      explanation: "The JWT's exp claim is in the past.",
      example: "User's session outlived the token TTL.",
      remediation: "Refresh the token or re-login.",
      source: "jwt",
    };
  }
  if (err.name === "NotBeforeError") {
    return {
      status: 401, code: "TOKEN_NOT_ACTIVE", message: "Authentication token is not yet active",
      isOperational: true, category: "auth", retryable: false,
      explanation: "The JWT's nbf claim is in the future.",
      example: "Clock skew between servers.",
      remediation: "Sync clocks, adjust nbf.",
      source: "jwt",
    };
  }
  return {
    status: 401, code: "INVALID_TOKEN", message: "Invalid authentication token",
    isOperational: true, category: "auth", retryable: false,
    explanation: "The JWT failed signature/format verification.",
    example: "Token tampered or wrong secret.",
    remediation: "Re-issue the token.",
    source: "jwt",
  };
}

function fromBodyParser(err) {
  const mapped = BODY_ERRORS[err.type];
  if (!mapped) return null;
  return { ...mapped, isOperational: true, source: "body_parser" };
}

function fromMulter(err) {
  const mapped = MULTER_ERRORS[err.code];
  if (!mapped) return null;
  return { ...mapped, isOperational: true, source: "multer" };
}

function fromSystem(err) {
  const mapped = SYSTEM_ERRORS[err.code];
  if (!mapped) return null;
  return { ...mapped, isOperational: false, source: "network" };
}

function normalizeError(err) {
  // 1. ApiError
  if (err instanceof ApiError) {
    return {
      status: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
      isOperational: err.isOperational,
      category: err.statusCode < 500 ? "client_input" : "server",
      retryable: false,
      explanation: "An explicitly thrown ApiError from application code.",
      example: "Controller called ApiError.badRequest(...).",
      remediation: "Depends on the code — check logs.",
      source: "api",
    };
  }

  // 2. Zod
  if (err && err.name === "ZodError") return fromZod(err);

  // 3. JWT
  if (err && ["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(err.name)) {
    return fromJwt(err);
  }

  // 4. body-parser
  if (err && err.type) {
    const bp = fromBodyParser(err);
    if (bp) return bp;
  }

  // 5. Multer
  if (err && err.name === "MulterError" && err.code) {
    const mu = fromMulter(err);
    if (mu) return mu;
  }

  // 6. PostgreSQL
  if (isPgError(err)) return fromPgError(err);

  // 7. Node system / network
  if (err && err.code) {
    const sys = fromSystem(err);
    if (sys) return sys;
  }

  // 8. err.status
  if (err && Number.isInteger(err.status) && err.status >= 400 && err.status < 600) {
    return {
      status: err.status,
      code: err.code || `HTTP_${err.status}`,
      message: err.expose === false ? "Request failed" : (err.message || "Request failed"),
      details: err.details,
      isOperational: err.status < 500,
      category: err.status < 500 ? "client_input" : "server",
      retryable: false,
      explanation: "A third-party middleware threw an HTTP-status error.",
      example: "Rate-limit, CORS, or helmet rejection.",
      remediation: "Inspect the middleware's docs for the code.",
      source: "middleware",
    };
  }

  // 9. err.statusCode
  if (err && Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 600) {
    return {
      status: err.statusCode,
      code: err.code || `HTTP_${err.statusCode}`,
      message: err.message || "Request failed",
      details: err.details,
      isOperational: err.statusCode < 500,
      category: err.statusCode < 500 ? "client_input" : "server",
      retryable: false,
      explanation: "An error carried an explicit statusCode.",
      example: "Custom error class.",
      remediation: "Check the originating module.",
      source: "custom",
    };
  }

  // 10. Fallback
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    details: undefined,
    isOperational: false,
    category: "unknown",
    retryable: false,
    explanation: "An error we didn't recognize reached the handler.",
    example: "New library error class not mapped yet.",
    remediation: "Add a branch to normalizeError for this error.",
    source: "unknown",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────────────────────
function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const normalized = normalizeError(err);
  const isServerError = normalized.status >= 500;

  // ── Build the payload (used for both logging and n8n) ────────────────────
  const event = {
    eventType: "api_error",
    timestamp: formatSastTimestamp(),
    level: isServerError ? "error" : "warn",
    requestId: req.id || req.headers["x-request-id"] || null,

    request: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      userId: req.user?.id ?? null,
    },

    error: {
      status: normalized.status,
      code: normalized.code,
      message: normalized.message,
      category: normalized.category,
      retryable: normalized.retryable,
      isOperational: normalized.isOperational,
      source: normalized.source,
      explanation: normalized.explanation,
      example: normalized.example,
      remediation: normalized.remediation,
      details: normalized.details,
    },

    // Populated only if it's a Postgres error
    postgres: isPgError(err)
      ? {
          code: err.code,
          severity: err.severity,
          routine: err.routine,
          file: err.file,
          line: err.line,
          constraint: err.constraint,
          table: err.table,
          column: err.column,
          schema: err.schema,
          detail: err.detail,
          hint: err.hint,
        }
      : null,

    raw: {
      name: err?.name,
      message: err?.message,
      cause: err?.cause?.message,
      stack: err?.stack,
    },
  };

  // ── Local log ─────────────────────────────────────────────────────────────
  if (isServerError) logger.error(event);
  else logger.warn(event);

  // ── Fire-and-forget to n8n ────────────────────────────────────────────────
  // dispatchToN8n(event);

  // ── Response payload ─────────────────────────────────────────────────────
  const body = {
    error: {
      code: normalized.code,
      message: normalized.message,
      category: normalized.category,
      retryable: normalized.retryable,
      ...(normalized.details !== undefined ? { details: normalized.details } : {}),
      ...(env.isProd ? {} : { stack: err?.stack }),
    },
  };

  res.status(normalized.status).json(body);
}

module.exports = { notFound, errorHandler, normalizeError };