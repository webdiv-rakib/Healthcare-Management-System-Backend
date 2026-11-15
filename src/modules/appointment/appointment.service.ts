import { getBkashIdTOken } from "./../../lib/bkash";
import config from "../../config";

const bookAppointment = async () => {
	const bkashIdTOken = await getBkashIdTOken();
	if (!bkashIdTOken) {
		throw new Error("No Bkash Access Token Found");
	}
	const bkashCreatePaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized-checkout/payment/create`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdTOken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				payerReference: "TEST001ABC", // user email or phn number
				callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`, //
				amount: "1200",
				currency: "BDT",
				intent: "sale",
				merchantInvoiceNumber: "test003", // apointment number
				subMerchantName: "Test",
				merchantAssociationInfo: "MI05MID54RF09123456789",
			}),
		},
	);

	const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

	return bkashCreatePaymentResult;
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
	const paymentId = query.paymentID;
	if (!paymentId) {
		throw new Error("payment ID Missing");
	}
	const status = query.status;
	if (!status) {
		throw new Error("Payment Status is Missing");
	}

	const bkashIdToken = await getBkashIdTOken();

	if (!bkashIdToken) {
		throw new Error("No Bkash Access Token Found");
	}

	const executedPaymentResponse = await fetch(
		`${config.bkash_base_url}/tokenized-checkout/payment/execute`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
				Authorization: bkashIdToken,
				"X-App-Key": config.bkash_app_key,
			},
			body: JSON.stringify({
				paymentId: paymentId,
			}),
		},
	);

	const executedPaymentResult = await executedPaymentResponse.json();

	if (status === "success") {
		return {
			executedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
		};
	}
	if (status === "failure") {
		return {
			executedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
		};
	}
	if (status === "cancel") {
		return {
			executedPaymentResult,
			redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
		};
	}

	return {
		executedPaymentResult,
		redirectUrl: `${config.frontend_url}/dashboard/my-appointments`,
	};
};

export const appointmentService = {
	bookAppointment,
	bookAppointmentCallback,
};
