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

    [Fact]
    [Trait("BR", "BR-02")]
    public void ShouldWithdraw_WhenBalanceSuffices()
    {
        var account = new Account();
        account.Deposit(25m);
        account.Withdraw(10m);
        Assert.Equal(15m, account.Balance);
    }

    [Fact]
    [Trait("BR", "BR-03")]
    public void ShouldRefuseWithdrawal_WhenBalanceIsShort()
    {
        var account = new Account();
        account.Deposit(5m);
        Assert.Throws<Overdraft>(() => account.Withdraw(10m));
    }
}
