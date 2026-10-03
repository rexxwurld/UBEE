namespace UBee.App.Services;

/// <summary>
/// Nigerian mobile-number helpers. A user's phone number IS their account
/// number (minus the leading 0), so the app and the backend (utils/phone.js)
/// must normalize identically.
/// </summary>
public static class PhoneFormatter
{
    /// <summary>
    /// 08160135713 / 8160135713 / 2348160135713 / +234 816 013 5713 -> "8160135713"
    /// (the account number). Null if it is not a valid Nigerian mobile number.
    /// </summary>
    public static string? ToNational(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;
        var d = new string(input.Where(c => !char.IsWhiteSpace(c) && c is not ('-' or '(' or ')' or '.')).ToArray());
        if (d.StartsWith('+')) d = d[1..];
        if (d.Length == 0 || !d.All(char.IsAsciiDigit)) return null;

        if (d.Length == 13 && d.StartsWith("234")) d = d[3..];
        else if (d.Length == 11 && d[0] == '0') d = d[1..];

        return d.Length == 10 && d[0] is >= '7' and <= '9' ? d : null;
    }

    /// <summary>"08160135713" - the form sent to the API. Null if invalid.</summary>
    public static string? ToLocal(string? input) => ToNational(input) is { } n ? "0" + n : null;
}

public static class PinRules
{
    public const int Length = 6;

    public static bool IsValidShape(string? pin) => pin is { Length: Length } && pin.All(char.IsAsciiDigit);

    /// <summary>Same "too easy" rules as the backend (utils/pin.js): 000000, 123456, 654321, 121212, 123123.</summary>
    public static bool IsWeak(string pin)
    {
        if (pin.All(c => c == pin[0])) return true;
        var step = pin[1] - pin[0];
        if (Math.Abs(step) == 1 && Enumerable.Range(1, pin.Length - 1).All(i => pin[i] - pin[i - 1] == step)) return true;
        if (pin[..2] == pin[2..4] && pin[2..4] == pin[4..6]) return true;
        if (pin[..3] == pin[3..6]) return true;
        return false;
    }
}
