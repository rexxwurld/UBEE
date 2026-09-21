using CommunityToolkit.Mvvm.Input;
using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class ResetPasswordViewModel : ViewModelBase, IQueryAttributable
{
    private readonly IApiClient _api; public ResetPasswordViewModel(IApiClient api) => _api = api;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string email = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string otp = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string newPassword = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string confirmPassword = "";
    public void ApplyQueryAttributes(IDictionary<string, object> query) { if (query.TryGetValue("email", out var e)) Email = Uri.UnescapeDataString(e?.ToString() ?? ""); }
    [RelayCommand] private async Task ResetAsync()
    {
        ClearMessages();
        if (Otp.Length != 6 || !Otp.All(char.IsDigit)) { ErrorMessage = "Enter the 6-digit code sent to your email."; return; }
        if (NewPassword.Length < 8) { ErrorMessage = "Password must be at least 8 characters."; return; }
        if (NewPassword != ConfirmPassword) { ErrorMessage = "Passwords do not match."; return; }
        IsBusy = true;
        try
        {
            var r = await _api.PostAsync<object, object>("auth/reset-password", new { email = Email.Trim(), otp = Otp.Trim(), password = NewPassword });
            if (!r.Success) { ShowError(r); return; }
            SuccessMessage = "Password reset complete.";
            await Task.Delay(700);
            await Shell.Current.GoToAsync("//login");
        }
        finally { IsBusy = false; }
    }
    [RelayCommand] private Task GoLoginAsync() => Shell.Current.GoToAsync("//login");
}
