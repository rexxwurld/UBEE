using System.Globalization;
namespace UBee.App;

/// <summary>Shows filter values nicely in the pickers: "transfer" -> "Transfer", and "all" -> the ConverterParameter (e.g. "All Categories").</summary>
public sealed class TitleCaseConverter : IValueConverter
{
    public object? Convert(object? value, Type targetType, object? parameter, CultureInfo culture)
    {
        if (value is not string s || s.Length == 0) return value;
        if (s == "all" && parameter is string label) return label;
        return char.ToUpperInvariant(s[0]) + s[1..];
    }
    public object? ConvertBack(object? value, Type targetType, object? parameter, CultureInfo culture) => value;
}
