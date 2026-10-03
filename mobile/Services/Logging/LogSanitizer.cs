using System.Text.RegularExpressions;

namespace UBee.App.Services.Logging;

/// <summary>
/// Best-effort scrubber applied to EVERYTHING that is written to the crash log
/// (messages, exception messages, stack traces, context values, breadcrumbs).
/// It is a safety net: the logger also never records request/response bodies,
/// form fields, SecureStorage contents or exception.Data.
/// </summary>
internal static class LogSanitizer
{
    private const string Redacted = "[REDACTED]";
    private const RegexOptions Opts = RegexOptions.IgnoreCase | RegexOptions.CultureInvariant;
    private static readonly TimeSpan Timeout = TimeSpan.FromMilliseconds(150);

    private const string SensitiveWords =
        "pass(?:word|phrase)?|pwd|pin|token|secret|api[-_ ]?key|apikey|authorization|otp|cvv|cvc|card[-_ ]?(?:number|no)?|" +
        "pan|bvn|nin|ssn|credential|refresh|signature|cookie|session[-_ ]?id|private[-_ ]?key|encryption[-_ ]?key|iban|account[-_ ]?(?:number|no)";

    private static readonly (Regex Pattern, string Replacement)[] Rules =
    {
        // Authorization: Bearer xxx / Basic xxx
        (new Regex(@"\b(Bearer|Basic)\s+[A-Za-z0-9\-._~+/]+=*", Opts, Timeout), "$1 " + Redacted),
        // JWTs
        (new Regex(@"\beyJ[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]{5,}\.[A-Za-z0-9_\-]*", Opts, Timeout), Redacted),
        // JSON  "password":"abc"  /  "pin": 1234
        (new Regex("(\"[^\"\\r\\n]*(?:" + SensitiveWords + ")[^\"\\r\\n]*\"\\s*:\\s*)(\"(?:[^\"\\\\]|\\\\.)*\"|[^,}\\]\\s]+)", Opts, Timeout), "$1\"" + Redacted + "\""),
        // key=value / key: value   (password=abc, pin: 1234, refreshToken=...)
        (new Regex(@"\b([A-Za-z_\-]*(?:" + SensitiveWords + @")[A-Za-z_\-]*)\s*[=:]\s*[^\s,;&""'}\]]+", Opts, Timeout), "$1=" + Redacted),
        // Query strings in URLs can carry tokens / account numbers
        (new Regex(@"(https?://[^\s?#""']+)\?[^\s""']*", Opts, Timeout), "$1?[query-removed]"),
        // e-mail addresses
        (new Regex(@"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", Opts, Timeout), "[EMAIL-REDACTED]"),
        // card-like numbers (13-19 digits, optional spaces/dashes)
        (new Regex(@"\b(?:\d[ \-]?){12,18}\d\b", Opts, Timeout), "[NUMBER-REDACTED]"),
        // phone / account numbers (9+ consecutive digits, optional +)
        (new Regex(@"(?<![\w.])\+?\d{9,}\b", Opts, Timeout), "[NUMBER-REDACTED]"),
    };

    private static readonly Regex SensitiveKey =
        new(SensitiveWords, Opts, Timeout);

    public static string Clean(string? text)
    {
        if (string.IsNullOrEmpty(text)) return text ?? string.Empty;
        var result = text!;
        foreach (var (pattern, replacement) in Rules)
        {
            try { result = pattern.Replace(result, replacement); }
            catch (RegexMatchTimeoutException) { return "[unsanitizable text omitted]"; }
            catch { /* never throw from the logger */ }
        }
        return result;
    }

    /// <summary>Returns true when a context key name looks sensitive (value must then be dropped).</summary>
    public static bool IsSensitiveKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return false;
        try { return SensitiveKey.IsMatch(key); } catch { return true; }
    }
}
