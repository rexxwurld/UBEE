using UBee.App.ViewModels;
namespace UBee.App.Views;
public partial class LoginPage : ContentPage { public LoginPage(LoginViewModel vm){InitializeComponent();BindingContext=vm;} }
