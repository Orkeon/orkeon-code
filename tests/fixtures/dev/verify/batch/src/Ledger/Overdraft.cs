namespace Vdemo.Ledger;

public sealed class Overdraft(decimal balance, decimal asked)
    : InvalidOperationException($"asked {asked}, the balance holds {balance}");
