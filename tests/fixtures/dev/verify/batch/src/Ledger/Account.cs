namespace Vdemo.Ledger;

public sealed class Account
{
    public decimal Balance { get; private set; }

    public void Deposit(decimal amount)
    {
        if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount));
        Balance += amount;
    }

    public void Withdraw(decimal amount)
    {
        if (amount > Balance) throw new Overdraft(Balance, amount);
        Balance -= amount;
    }
}
