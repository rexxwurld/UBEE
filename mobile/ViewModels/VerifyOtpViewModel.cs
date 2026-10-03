using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;
using UBee.App.Services;
namespace UBee.App.ViewModels;
public partial class VerifyOtpViewModel : ViewModelBase, IQueryAttributable
{
    private readonly IAuthService _auth; public VerifyOtpViewModel(IAuthService auth) => _auth = auth;
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string otp = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string email = "";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string challengeId = "";
    public void ApplyQueryAttributes(IDictionary<string, object> query) { if (query.TryGetValue("challengeId", out var c)) ChallengeId = Uri.UnescapeDataString(c?.ToString() ?? ""); if (query.TryGetValue("email", out var e)) Email = Uri.UnescapeDataString(e?.ToString() ?? ""); }
    [RelayCommand] private async Task VerifyAsync()
    {
        ClearMessages(); if (Otp.Length != 6 || !Otp.All(char.IsDigit)) { ErrorMessage = "Enter the 6-digit OTP."; return; }
        IsBusy = true;
        try
        {
            var r = await _auth.VerifyMfaAsync(ChallengeId, Otp);
            if (!r.Success) { ShowError(r); return; }
            SuccessMessage = "OTP verified.";
            await Shell.Current.GoToAsync("//main/dashboard");
        } finally { IsBusy = false; }
    }
    [RelayCommand] private async Task ResendAsync() { ClearMessages(); ErrorMessage = "OTP resend endpoint is not available in the current backend contract."; await Task.CompletedTask; }
    [RelayCommand] private Task GoLoginAsync() => Shell.Current.GoToAsync("//login");
}
