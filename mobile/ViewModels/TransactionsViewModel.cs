using CommunityToolkit.Mvvm.Input;
using UBee.App.Models;
using UBee.App.Services;
using System.Collections.ObjectModel;
using System.ComponentModel;
namespace UBee.App.ViewModels;

/// <summary>One month of transactions + its In/Out totals (the header card in the list).</summary>
public sealed class TransactionGroup : ObservableCollection<TransactionDto>
{
    public string Month { get; }
    public TransactionGroup(string month) => Month = month;

    // Only completed money movement counts: pending/failed are left out of the totals.
    public string InDisplay
    {
        get { var total = this.Where(x => x.StatusKind == "success" && x.IsCredit).Sum(x => x.Amount); return $"₦{total:N2}"; }
    }
    public string OutDisplay
    {
        get { var total = this.Where(x => x.StatusKind == "success" && !x.IsCredit).Sum(x => x.Amount + x.Fee); return $"₦{total:N2}"; }
    }

    public void AddItem(TransactionDto item)
    {
        Add(item);
        OnPropertyChanged(new PropertyChangedEventArgs(nameof(InDisplay)));
        OnPropertyChanged(new PropertyChangedEventArgs(nameof(OutDisplay)));
    }
}

public partial class TransactionsViewModel : ViewModelBase
{
    private readonly IApiClient _api;
    private string? _nextCursor;
    private readonly List<TransactionDto> _all = [];

    public ObservableCollection<TransactionGroup> Groups { get; } = [];

    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string typeFilter = "all";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string statusFilter = "all";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private bool hasMore = true;

    /// <summary>Set when we open a transaction's details so coming back doesn't reload the list and lose the scroll position.</summary>
    public bool SkipNextReload { get; set; }

    public TransactionsViewModel(IApiClient api) => _api = api;

    [RelayCommand]
    public async Task LoadAsync()
    {
        ClearMessages();
        _all.Clear(); Groups.Clear(); _nextCursor = null; HasMore = true;
        await LoadMoreAsync();
    }

    [RelayCommand]
    public async Task LoadMoreAsync()
    {
        if (IsBusy || !HasMore) return;
        IsBusy = true;
        try
        {
            var endpoint = "transaction?limit=50" + (_nextCursor is null ? "" : $"&before={Uri.EscapeDataString(_nextCursor)}");
            var r = await _api.GetAsync<TransactionPageDto>(endpoint);
            if (!r.Success) { ShowError(r); return; }
            var items = r.Data?.Data ?? [];
            _all.AddRange(items);
            Append(items);
            _nextCursor = r.Data?.NextCursor;
            HasMore = !string.IsNullOrWhiteSpace(_nextCursor);
        }
        finally { IsBusy = false; }
    }

    [RelayCommand]
    private async Task OpenDetailsAsync(TransactionDto? tx)
    {
        if (tx is null) return;
        SkipNextReload = true;
        await Shell.Current.GoToAsync("transaction-details", new Dictionary<string, object> { ["tx"] = tx });
    }

    private bool Matches(TransactionDto x) =>
        (TypeFilter == "all" || x.Type == TypeFilter) && (StatusFilter == "all" || x.Status == StatusFilter);

    // Adds to the existing month groups instead of rebuilding, so paging in more items doesn't jump the list back to the top.
    private void Append(IEnumerable<TransactionDto> items)
    {
        foreach (var item in items.Where(Matches))
        {
            var key = item.MonthKey;
            if (Groups.LastOrDefault() is { } last && last.Month == key) last.AddItem(item);
            else { var g = new TransactionGroup(key); g.AddItem(item); Groups.Add(g); }
        }
    }

    private void Rebuild() { Groups.Clear(); Append(_all); }

    partial void OnTypeFilterChanged(string value) => Rebuild();
    partial void OnStatusFilterChanged(string value) => Rebuild();
}
