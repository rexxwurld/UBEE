// Login PIN rules. One constant so changing the length later is a
// one-line edit here (plus the matching check in the mobile app).
const PIN_LENGTH = 6;
const PIN_RE = new RegExp(`^\\d{${PIN_LENGTH}}$`);

// A 6-digit PIN only has 1,000,000 possibilities, so reject the ones
// everybody tries first: 000000, 111111, 123456, 654321, 121212.
function isWeakPin(pin) {
    if (/^(\d)\1+$/.test(pin)) return true;                       // all same digit
    const digits = pin.split("").map(Number);
    const step = digits[1] - digits[0];
    if (Math.abs(step) === 1 && digits.every((d, i) => i === 0 || d - digits[i - 1] === step)) return true; // 123456 / 654321
    if (/^(\d\d)\1+$/.test(pin) || /^(\d\d\d)\1$/.test(pin)) return true; // 121212, 123123
    return false;
}

module.exports = { PIN_LENGTH, PIN_RE, isWeakPin };
