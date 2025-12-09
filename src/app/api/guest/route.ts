import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import prisma from "@/lib/prisma";
import {
	Gender,
	LastEducation,
	Purpose,
	QueueStatus,
	QueueType,
	ServiceStatus,
} from "@/generated/prisma";

const guestSchema = z.object({
	fullName: z.string().min(2, "Nama lengkap minimal 2 karakter"),
	email: z
		.string()
		.email("Format email tidak valid")
		.optional()
		.or(z.literal("")),
	address: z
		.string()
		.min(5, "Alamat minimal 5 karakter")
		.max(200, "Alamat terlalu panjang")
		.optional(),
	phone: z
		.string()
		.min(8, "Nomor HP minimal 8 digit")
		.max(20, "Nomor HP maksimal 20 digit")
		.regex(/^[0-9+()\s-]+$/, "Nomor HP hanya boleh berisi angka"),
	age: z.preprocess(
		(value) => {
			if (value === "" || value === null || typeof value === "undefined") {
				return undefined;
			}
			const asNumber = Number(value);
			return Number.isNaN(asNumber) ? value : asNumber;
		},
		z
			.number()
			.int()
			.min(1, "Umur minimal 1 tahun")
			.max(120, "Umur tidak valid")
			.optional()
	),
	institution: z
		.string()
		.min(2, "Asal/Instansi minimal 2 karakter")
		.max(150),
	gender: z.nativeEnum(Gender, {
		required_error: "Jenis kelamin wajib dipilih",
	}),
	lastEducation: z.nativeEnum(LastEducation, {
		required_error: "Pendidikan terakhir wajib dipilih",
	}),
	occupation: z.enum(
		[
			"Guru/Dosen",
			"Karyawan BUMN",
			"Karyawan Swasta",
			"Pelajar/Mahasiswa",
			"PNS/PPPK",
			"TNI/Polri",
			"Wiraswasta",
			"Lainnya",
		],
		{ required_error: "Pilih pekerjaan" }
	),
	purpose: z.nativeEnum(Purpose, {
		required_error: "Keperluan wajib dipilih",
	}),
});

const purposeToServiceName: Record<Purpose, string> = {
	[Purpose.KONSULTASI_STATISTIK]: "Konsultasi Statistik",
	[Purpose.PERPUSTAKAAN]: "Perpustakaan",
	[Purpose.REKOMENDASI_STATISTIK]: "Rekomendasi Statistik",
	[Purpose.LAINNYA]: "Konsultasi Statistik",
};

const formatQueueDate = (date: Date): string => {
	const day = date.getDate().toString().padStart(2, "0");
	const month = (date.getMonth() + 1).toString().padStart(2, "0");
	return `${day}${month}`;
};

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const parsed = guestSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json(
				{
					error: "Data tidak valid",
					details: parsed.error.flatten().fieldErrors,
				},
				{ status: 400 }
			);
		}

		const data = parsed.data;
		const sanitized = {
			...data,
			fullName: data.fullName.trim(),
			email: data.email?.trim() ?? null,
			address: data.address?.trim(),
			phone: data.phone.trim(),
			institution: data.institution.trim(),
			occupation: data.occupation.trim(),
		};

		const queueDate = new Date();
		queueDate.setHours(0, 0, 0, 0);

		type GuestQueueResult = {
			guest: { fullName: string; purpose: Purpose | null };
			queue: {
				id: string;
				queueNumber: number;
				createdAt: Date;
				status: QueueStatus;
				service: { name: string };
				trackingLink: string | null;
			};
		};

		let result: GuestQueueResult | null = null;

		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				result = await prisma.$transaction(async (tx) => {
					const preferredServiceName = purposeToServiceName[sanitized.purpose];
					const preferredService = await tx.service.findFirst({
						where: {
							name: preferredServiceName,
							status: ServiceStatus.ACTIVE,
						},
					});

					const fallbackService =
						preferredService ??
						(await tx.service.findFirst({
							where: { status: ServiceStatus.ACTIVE },
							orderBy: { createdAt: "asc" },
						}));

					if (!fallbackService) {
						throw new Error("NO_ACTIVE_SERVICE");
					}

					const latestQueue = await tx.queue.findFirst({
						where: {
							queueDate,
							serviceId: fallbackService.id,
						},
						select: { queueNumber: true },
						orderBy: { queueNumber: "desc" },
					});

					const nextQueueNumber = latestQueue
						? latestQueue.queueNumber + 1
						: 1; // TODO: If numbering must be global per day (not per service), adjust scope and unique constraint.

					const guest = await tx.guest.create({
						data: {
							fullName: sanitized.fullName,
							email: sanitized.email,
							address: sanitized.address,
							phone: sanitized.phone,
							age: sanitized.age,
							institution: sanitized.institution,
							gender: sanitized.gender,
							lastEducation: sanitized.lastEducation,
							occupation: sanitized.occupation,
							purpose: sanitized.purpose,
						},
					});

					const visitor = await tx.visitor.create({
						data: {
							name: sanitized.fullName,
							phone: sanitized.phone,
							institution: sanitized.institution,
							email: sanitized.email,
						},
					});

					const queue = await tx.queue.create({
						data: {
							queueNumber: nextQueueNumber,
							queueDate,
							status: QueueStatus.WAITING,
							queueType: QueueType.OFFLINE,
							visitorId: visitor.id,
							guestId: guest.id,
							serviceId: fallbackService.id,
							trackingLink: nanoid(10),
							filledSKD: false,
						},
						include: { service: true },
					});

					return { guest, queue };
				});
				break;
			} catch (error) {
				if ((error as { code?: string }).code === "P2002" && attempt < 2) {
					// Retry on queue number unique constraint collisions
					continue;
				}
				throw error;
			}
		}

		if (!result) {
			return NextResponse.json(
				{ error: "Gagal menetapkan nomor antrean, coba lagi." },
				{ status: 409 }
			);
		}

		return NextResponse.json(
			{
				success: true,
				message: "Data buku tamu berhasil disimpan",
				data: {
					queueId: result.queue.id,
					queueNumber: result.queue.queueNumber,
					queueCode: `${result.queue.queueNumber}-${formatQueueDate(
						new Date(result.queue.createdAt)
					)}`,
					status: result.queue.status,
					purpose: result.guest.purpose,
					serviceName: result.queue.service.name,
					guestName: result.guest.fullName,
					trackingLink: result.queue.trackingLink,
				},
			},
			{ status: 201 }
		);
	} catch (error) {
		if ((error as { code?: string }).code === "P2002") {
			return NextResponse.json(
				{ error: "Nomor antrean duplikat, silakan coba lagi." },
				{ status: 409 }
			);
		}
		if ((error as Error).message === "NO_ACTIVE_SERVICE") {
			return NextResponse.json(
				{ error: "Tidak ada layanan aktif untuk membuat antrean." },
				{ status: 400 }
			);
		}

		console.error("Error processing guest submission:", error);
		return NextResponse.json(
			{ error: "Gagal memproses buku tamu" },
			{ status: 500 }
		);
	}
}
