import config from "../config";

export const getBkashIdTOken = async () => {
	const resporse = await fetch(
		`${config.bkash_base_url}/tokenized-checkout/auth/grant-token`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				username: config.bkash_username,
				password: config.bkash_password,
			},
			body: JSON.stringify({
				app_key: config.bkash_app_key,
				app_secret: config.bkash_app_secret,
			}),
		},
	);
    const result = resporse.json();
    return result
};
