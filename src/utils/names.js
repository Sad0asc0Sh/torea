/**
 * Build a display name from first/last name with username fallback.
 * @param {object} user - user-like object containing first_name/last_name/username.
 * @returns {string} trimmed display name or empty string.
 */
function buildDisplayName(user = {}) {
  const first = (user.first_name ?? '').toString().trim();
  const last = (user.last_name ?? '').toString().trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const username = (user.username ?? '').toString().trim();
  return username || '';
}

module.exports = {
  buildDisplayName,
};
