import React, { useState, useEffect } from "react";
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Divider,
  Chip,
  LinearProgress,
} from "@mui/material";

function Funding() {
  const [loanData, setLoanData] = useState(null);

  useEffect(() => {
    // Calculate loan details for grace loan (interest-only payments)
    const loanStartDate = new Date("2024-11-24");
    const currentDate = new Date();
    const loanAmount = 415000; // ILS
    const annualRate = 0.06;
    const monthlyRate = annualRate / 12;

    // Calculate months elapsed since loan start
    const monthsElapsed = Math.floor(
      (currentDate.getTime() - loanStartDate.getTime()) /
        (1000 * 60 * 60 * 24 * 30.44)
    );

    // Grace loan term: 3 years
    const loanTermMonths = 36; // 3 years

    // For grace loan: monthly payment is interest only
    const monthlyInterestPayment = loanAmount * monthlyRate;

    // For grace loan: principal remains unchanged until maturity
    const paymentsToDate = Math.max(0, monthsElapsed);
    const remainingBalance = loanAmount; // Principal never decreases in grace loan

    // Calculate total interest paid (only interest payments made)
    const totalInterestPaid = monthlyInterestPayment * paymentsToDate;
    const principalPaid = 0; // No principal paid during grace period
    const totalPaid = totalInterestPaid;

    // Next payment date (10th of next month)
    const nextPaymentDate = new Date();
    if (nextPaymentDate.getDate() <= 10) {
      nextPaymentDate.setDate(10);
    } else {
      nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
      nextPaymentDate.setDate(10);
    }

    setLoanData({
      originalAmount: loanAmount,
      remainingBalance: remainingBalance,
      monthlyPayment: monthlyInterestPayment,
      annualRate,
      monthsElapsed: paymentsToDate,
      totalMonths: loanTermMonths,
      principalPaid,
      interestPaid: totalInterestPaid,
      totalPaid,
      nextPaymentDate,
      startDate: loanStartDate,
      progressPercentage: (paymentsToDate / loanTermMonths) * 100,
      isGraceLoan: true, // Flag to indicate this is a grace loan
    });
  }, []);

  const formatCurrency = (amount, currency = "ILS") => {
    return new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  if (!loanData) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading loan data...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
        Funding Status
      </Typography>

      <Grid container spacing={3}>
        {/* Loan Overview */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
              <Typography variant="h5">Grace Loan Overview</Typography>
              <Chip
                label="Interest-Only Payments"
                color="info"
                variant="outlined"
              />
            </Box>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Loan Term Progress ({loanData.progressPercentage.toFixed(1)}% of
                term elapsed)
              </Typography>
              <LinearProgress
                variant="determinate"
                value={loanData.progressPercentage}
                sx={{ height: 8, borderRadius: 4 }}
              />
            </Box>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Principal Amount
                </Typography>
                <Typography variant="h6">
                  {formatCurrency(loanData.originalAmount)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Unchanged - due at maturity)
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Outstanding Principal
                </Typography>
                <Typography variant="h6" color="error">
                  {formatCurrency(loanData.remainingBalance)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Due at loan maturity)
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Monthly Interest Payment
                </Typography>
                <Typography variant="h6">
                  {formatCurrency(loanData.monthlyPayment)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Interest only)
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Interest Rate
                </Typography>
                <Typography variant="h6">
                  {(loanData.annualRate * 100).toFixed(1)}% annually
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({((loanData.annualRate * 100) / 12).toFixed(2)}% monthly)
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* Payment Details */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Payment Details
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Next Payment Date
                </Typography>
                <Typography variant="body1" sx={{ mb: 1 }}>
                  {formatDate(loanData.nextPaymentDate)}
                </Typography>
                <Chip label="Monthly on 10th" color="info" size="small" />
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Payments Made
                </Typography>
                <Typography variant="body1">
                  {loanData.monthsElapsed} of {loanData.totalMonths} payments
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Loan Start Date
                </Typography>
                <Typography variant="body1">
                  {formatDate(loanData.startDate)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Financial Summary */}
        <Grid item xs={12} md={6}>
          <Card elevation={3}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Financial Summary
              </Typography>
              <Divider sx={{ mb: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Principal Paid
                </Typography>
                <Typography variant="body1" color="info.main">
                  {formatCurrency(loanData.principalPaid)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Grace period - no principal payments)
                </Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Interest Paid
                </Typography>
                <Typography variant="body1" color="warning.main">
                  {formatCurrency(loanData.interestPaid)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ({loanData.monthsElapsed} payments of{" "}
                  {formatCurrency(loanData.monthlyPayment)})
                </Typography>
              </Box>
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                  Total Paid to Date
                </Typography>
                <Typography variant="body1">
                  {formatCurrency(loanData.totalPaid)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Interest payments only)
                </Typography>
              </Box>
              <Box>
                <Typography variant="body2" color="text.secondary">
                  Remaining Principal Due
                </Typography>
                <Typography variant="body1" color="error.main">
                  {formatCurrency(loanData.remainingBalance)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  (Due at loan maturity)
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Loan Terms */}
        <Grid item xs={12}>
          <Paper elevation={3} sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
              Grace Loan Terms & Information
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Loan Type
                </Typography>
                <Typography variant="body1">
                  Grace Loan (Interest-Only)
                </Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Currency
                </Typography>
                <Typography variant="body1">Israeli Shekel (ILS)</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Payment Structure
                </Typography>
                <Typography variant="body1">Monthly Interest Only</Typography>
              </Grid>
              <Grid item xs={12} md={3}>
                <Typography variant="body2" color="text.secondary">
                  Principal Repayment
                </Typography>
                <Typography variant="body1">
                  Balloon Payment at Maturity
                </Typography>
              </Grid>
            </Grid>
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle2" gutterBottom color="primary">
                Grace Loan Structure:
              </Typography>
              <Box sx={{ ml: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  • <strong>Monthly Payments:</strong> Interest only (
                  {formatCurrency(loanData.monthlyPayment)}/month)
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  • <strong>Principal:</strong> Remains at{" "}
                  {formatCurrency(loanData.originalAmount)} throughout the term
                </Typography>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  • <strong>Maturity:</strong> Full principal of{" "}
                  {formatCurrency(loanData.originalAmount)} due at loan end
                </Typography>
              </Box>
            </Box>
            <Box sx={{ mt: 2, p: 2, bgcolor: "info.light", borderRadius: 1 }}>
              <Typography variant="body2" color="info.dark">
                <strong>Note:</strong> This is a grace loan where only interest
                is paid monthly. The full principal amount of{" "}
                {formatCurrency(loanData.originalAmount)} will be due at loan
                maturity. Loan proceeds were converted to USD for trading
                purposes.
              </Typography>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

export default Funding;
