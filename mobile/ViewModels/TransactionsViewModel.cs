using CommunityToolkit.Mvvm.Input; using UBee.App.Models; using UBee.App.Services; using System.Collections.ObjectModel;
namespace UBee.App.ViewModels;
public partial class TransactionsViewModel : ViewModelBase
{
    private readonly IApiClient _api; private string? _nextCursor; private bool _loaded;
    public ObservableCollection<TransactionDto> Transactions { get; }=[];
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string typeFilter="all";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private string statusFilter="all";
    [CommunityToolkit.Mvvm.ComponentModel.ObservableProperty] private bool hasMore=true;
    public TransactionsViewModel(IApiClient api)=>_api=api;
    [RelayCommand] public async Task LoadAsync(){Transactions.Clear();_nextCursor=null;HasMore=true;_loaded=true;await LoadMoreAsync();}
    [RelayCommand] public async Task LoadMoreAsync(){if(IsBusy||!HasMore)return;IsBusy=true;try{var endpoint="transaction?limit=50"+(_nextCursor is null?"":$"&before={Uri.EscapeDataString(_nextCursor)}");var r=await _api.GetAsync<TransactionPageDto>(endpoint);if(!r.Success){ShowError(r);return;}foreach(var x in r.Data?.Data??[])Transactions.Add(x);_nextCursor=r.Data?.NextCursor;HasMore=!string.IsNullOrWhiteSpace(_nextCursor);}finally{IsBusy=false;}}
    public IEnumerable<TransactionDto> FilteredTransactions => Transactions.Where(x=>(TypeFilter=="all"||x.Type==TypeFilter)&&(StatusFilter=="all"||x.Status==StatusFilter));
    partial void OnTypeFilterChanged(string value)=>OnPropertyChanged(nameof(FilteredTransactions)); partial void OnStatusFilterChanged(string value)=>OnPropertyChanged(nameof(FilteredTransactions));
}
