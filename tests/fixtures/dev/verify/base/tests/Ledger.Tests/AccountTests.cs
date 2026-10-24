namespace Vdemo.Ledger.Tests;

public sealed class AccountTests
{
    [Fact]
    [Trait("BR", "BR-01")]
    public void ShouldDeposit_WhenAmountIsPositive()
    {
        var account = new Account();
        account.Deposit(25m);
        Assert.Equal(25m, account.Balance);
    }
}
