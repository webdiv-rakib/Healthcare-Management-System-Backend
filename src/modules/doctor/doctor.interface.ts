export interface IUser {
    name: string;
    email: string;
}

export interface IDoctor {
    address?: string;
    specialization: string;
    licenseNumber: string;
    qualifications: string;
    experienceYears: number;
    bio?: string;
    consultationsFee: number; // Zod-এ required থাকায় এখানেও required রাখা ভালো
    contactNumber?: string;
}

export interface ICreateDoctorPayload {
    user: IUser;
    doctor: IDoctor;
}

export interface IVerifyDoctorEmailPayload {
    email: string,
    otp: string
}