using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using System.Collections.ObjectModel;
using UBee.App.Models;
using UBee.App.Services;
namespace UBee.App.ViewModels;

/// <summary>"Account Limits" screen: tier card, linked ID, daily limit usage, tier table, and the BVN/NIN upgrade form.</summary>
public partial class KycViewModel : ViewModelBase
{
    private readonly IApiClient _api; private readonly IAuthService _auth; private readonly IClipboardService _clipboard;
    public KycViewModel(IApiClient api, IAuthService auth, IClipboardService clipboard) { _api = api; _auth = auth; _clipboard = clipboard; }

    public ObservableCollection<TierRow> Tiers { get; } = [];

    [ObservableProperty] private string bvn = "";
    [ObservableProperty] private string nin = "";
    [ObservableProperty] private DateTime dateOfBirth = DateTime.Today.AddYears(-18);
    [ObservableProperty, NotifyPropertyChangedFor(nameof(ShowForm)), NotifyPropertyChangedFor(nameof(StatusText))] private string status = "unverified";
    [ObservableProperty] private string tier = "tier1";
    [ObservableProperty] private int tierNumber = 1;
    [ObservableProperty] private string fullname = "";
    [ObservableProperty] private string accountNumber = "—";
    [ObservableProperty] private string linkedId = "Not linked";
    [ObservableProperty] private string dailyText = "";
    [ObservableProperty] private double dailyProgress;

    public string TierLabel => $"Tier {TierNumber}";
    public string StatusText => string.IsNullOrEmpty(Status) ? "" : char.ToUpper(Status[0]) + Status[1..];
    public bool ShowForm => Status is not ("verified" or "submitted");
    partial void OnTierNumberChanged(int value) => OnPropertyChanged(nameof(TierLabel));

    private static string Naira(decimal v) => $"₦{v:N0}";

    [RelayCommand] public async Task LoadAsync()
    {
        var me = await _auth.GetMeAsync();
        if (me.Success && me.Data is not null) { Fullname = me.Data.Fullname ?? ""; AccountNumber = me.Data.AccountNumber ?? "—"; }

        var r = await _api.GetAsync<ApiEnvelope<KycStatusDto>>("kyc/status");
        if (!r.Success || r.Data?.Data is not { } d) return;

        Status = d.KycStatus ?? "unverified";
        Tier = d.KycTier ?? "tier1";
        TierNumber = Tier is { Length: > 4 } t && int.TryParse(t[4..], out var n) ? n : 1;
        LinkedId = (d.HasBvn, d.HasNin) switch { (true, true) => "BVN & NIN", (true, false) => "BVN", (false, true) => "NIN", _ => "Not linked" };

        var max = d.Limits?.MaxDailyOutbound ?? 0;
        DailyProgress = max > 0 ? Math.Min(1.0, (double)(d.DailyOutboundUsed / max)) : 0;
        DailyText = max > 0 ? $"{Naira(d.DailyOutboundUsed)} of {Naira(max)} used in the last 24 hours" : "";

        Tiers.Clear();
        foreach (var row in d.Tiers ?? [])
            Tiers.Add(new TierRow
            {
                Label = row.Tier is { Length: > 4 } rt ? $"Tier {rt[4..]}" : row.Tier ?? "",
                Daily = Naira(row.MaxDailyOutbound),
                Balance = row.MaxCumulativeBalance is { } b ? Naira(b) : "Unlimited",
                IsCurrent = row.Tier == Tier
            });
    }

    [RelayCommand] private async Task CopyAccountAsync() { if (AccountNumber != "—") { await _clipboard.SetTextAsync(AccountNumber); SuccessMessage = "Account number copied."; } }

    [RelayCommand] private async Task SubmitAsync()
    {
        ClearMessages();
        if (string.IsNullOrWhiteSpace(Bvn) && string.IsNullOrWhiteSpace(Nin)) { ErrorMessage = "Enter BVN or NIN."; return; }
        IsBusy = true;
        try
        {
            var r = await _api.PostAsync<KycSubmitRequest, ApiEnvelope<KycStatusDto>>("kyc/submit",
                new KycSubmitRequest(string.IsNullOrWhiteSpace(Bvn) ? null : Bvn.Trim(), string.IsNullOrWhiteSpace(Nin) ? null : Nin.Trim(), DateOfBirth.ToString("yyyy-MM-dd")));
            if (!r.Success) { ShowError(r); return; }
            Status = r.Data?.Data?.KycStatus ?? "submitted";
            SuccessMessage = "Submitted for review. Your tier is upgraded once it is approved.";
            await LoadAsync();
        }
        finally { IsBusy = false; }
    }
}
public sealed class ApiEnvelope<T> { public bool Status { get; set; } public T? Data { get; set; } public string? Message { get; set; } }
