/**
 * Student personal-identity eligibility guard for Quippe (Req 7.6, 7.7,
 * 7.8, 17.4, 17.5).
 *
 * This module lives in the deterministic core: no I/O, no randomness, no clock.
 * It imports nothing from `lib/ai` or `lib/data` — and here nothing from
 * `lib/schemas` either, because the guard scans arbitrary, untrusted payloads
 * (`unknown`) before they are ever handed to a schema.
 *
 * `rejectsStudentIdentity(payload)` returns `true` when the payload contains a
 * student personal-identity attribute and therefore MUST be rejected and never
 * persisted. The prohibited attributes, from Req 17.4, are:
 *
 *   full name, date of birth (DOB), home/street address, personal email,
 *   personal phone, photograph/headshot, government identifier
 *   (SSN, passport, driver's license, student ID number).
 *
 * The guard is intentionally conservative but targeted. It flags on two
 * signals:
 *
 *   1. Object KEY names (scanned recursively). This is the primary signal and
 *      the one that distinguishes a person's identity from legitimate org
 *      fields: `fullName`/`firstName`/`studentName`/`dob`/`homeAddress`/
 *      `personalEmail`/`govId`/`ssn` are flagged, while org-level `name`,
 *      `school`, `city`, `mission`, and `topic` are NOT. A bare `name` key is
 *      treated as an organization/offer name, not a person's full name.
 *
 *   2. Obvious VALUE patterns (SSN, email address, long government-id-like
 *      digit strings) regardless of key, so a disguised key cannot smuggle an
 *      identifier through. Free prose (mission/ask/topic) does not match these
 *      patterns, so legitimate text passes.
 *
 * It must PASS (return `false`) for legitimate mission / ask / topic / org
 * fields.
 */

// --- Key-name guard ------------------------------------------------------
//
// Keys are normalized to lowercase alphanumerics (separators stripped) so
// `full_name`, `fullName`, and `Full Name` all collapse to `fullname`. We then
// test the normalized key against a set of identity substrings.
//
// These substrings are chosen to catch a person's identity attribute while NOT
// matching org-level fields. In particular we never flag a bare `name` — only
// person-qualified name keys (`fullname`, `firstname`, `lastname`,
// `studentname`, `membername`, `legalname`, `middlename`, `maidenname`,
// `nickname`, `preferredname`) — so an organization or offer `name` is fine.
const IDENTITY_KEY_SUBSTRINGS: readonly string[] = [
  // full / personal names (never a bare "name")
  "fullname",
  "firstname",
  "lastname",
  "middlename",
  "maidenname",
  "legalname",
  "preferredname",
  "nickname",
  "givenname",
  "surname",
  "familyname",
  "studentname",
  "membername",
  "parentname",
  "guardianname",
  "advisorname",
  "teachername",
  // date of birth
  "dob",
  "dateofbirth",
  "birthdate",
  "birthday",
  "birthyear",
  // home / street address
  "homeaddress",
  "streetaddress",
  "mailingaddress",
  "residentialaddress",
  "homestreet",
  "zipcode",
  "postalcode",
  // personal email
  "personalemail",
  "studentemail",
  "homeemail",
  "emailaddress",
  // personal phone
  "personalphone",
  "homephone",
  "cellphone",
  "mobilephone",
  "phonenumber",
  "studentphone",
  // photo / headshot
  "photo",
  "headshot",
  "selfie",
  "avatar",
  "profilepicture",
  "profilephoto",
  "faceimage",
  // government identifiers
  "ssn",
  "socialsecurity",
  "govid",
  "governmentid",
  "nationalid",
  "passport",
  "passportnumber",
  "driverslicense",
  "driverlicense",
  "licensenumber",
  "studentid",
  "studentidnumber",
  "taxid",
] as const;

// Normalize a key: lowercase, strip everything that is not a letter or digit so
// camelCase, snake_case, kebab-case, and spaced variants all compare equal.
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function keyFlagsIdentity(key: string): boolean {
  const normalized = normalizeKey(key);
  if (normalized.length === 0) {
    return false;
  }
  return IDENTITY_KEY_SUBSTRINGS.some((needle) => normalized.includes(needle));
}

// --- Value guard ---------------------------------------------------------
//
// A small set of patterns that are, by themselves, unmistakably a personal
// identifier regardless of which key carried them. Free-text prose does not
// match these, so mission/ask/topic strings pass.
const VALUE_PATTERNS: readonly RegExp[] = [
  // US Social Security number: 123-45-6789 (with optional spaces/dashes).
  /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/,
  // An explicit email address value.
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,
] as const;

function valueFlagsIdentity(value: string): boolean {
  return VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

// --- Recursive scan ------------------------------------------------------

/**
 * Return `true` iff `payload` contains a student personal-identity attribute
 * and must be rejected; `false` for legitimate mission/ask/topic/org content.
 *
 * Pure and deterministic: the same input always yields the same result and the
 * input is never mutated.
 */
export function rejectsStudentIdentity(payload: unknown): boolean {
  return scan(payload, new Set());
}

function scan(node: unknown, seen: Set<object>): boolean {
  if (node === null || node === undefined) {
    return false;
  }

  if (typeof node === "string") {
    return valueFlagsIdentity(node);
  }

  if (typeof node === "number" || typeof node === "boolean") {
    return false;
  }

  if (typeof node !== "object") {
    // functions, symbols, bigint — not identity data for our purposes.
    return false;
  }

  // Guard against cyclic references so the scan always terminates.
  if (seen.has(node as object)) {
    return false;
  }
  seen.add(node as object);

  if (Array.isArray(node)) {
    return node.some((element) => scan(element, seen));
  }

  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (keyFlagsIdentity(key)) {
      return true;
    }
    if (scan(value, seen)) {
      return true;
    }
  }

  return false;
}
