import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Updated import path
import { format } from "date-fns";
import prisma from "@/lib/prisma"; // Import shared prisma instance
import type { Prisma } from "@/generated/prisma";

export async function GET(req: NextRequest) {
	try {
		// Check authentication
		const session = await getServerSession(authOptions);
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const { searchParams } = new URL(req.url);
		const todayString = format(new Date(), "yyyy-MM-dd");
		const startDateParam = searchParams.get("startDate") || todayString;
		const endDateParam = searchParams.get("endDate") || startDateParam;
		const exportFormat = searchParams.get("format") || "json";
		const maxRangeDays = 90;

		const startDate = new Date(startDateParam);
		startDate.setHours(0, 0, 0, 0);
		const endDate = new Date(endDateParam);
		endDate.setHours(0, 0, 0, 0);
		endDate.setDate(endDate.getDate() + 1);

		if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
			return NextResponse.json(
				{ error: "Tanggal tidak valid, gunakan format YYYY-MM-DD" },
				{ status: 400 }
			);
		}

		const diffDays =
			(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
		if (diffDays > maxRangeDays) {
			return NextResponse.json(
				{
					error: `Rentang tanggal terlalu besar. Maksimal ${maxRangeDays} hari untuk ekspor.`,
				},
				{ status: 400 }
			);
		}

		const totalRows = await prisma.queue.count({
			where: {
				createdAt: {
					gte: startDate,
					lt: endDate,
				},
			},
		});

		if (totalRows === 0) {
			return NextResponse.json(
				{ error: "No data to export for the selected date range" },
				{ status: 404 }
			);
		}

		const queueWithRelations = {
			include: {
				visitor: true,
				service: true,
				admin: true,
			},
		} satisfies Prisma.QueueFindManyArgs;

		type QueueWithRelations = Prisma.QueueGetPayload<
			typeof queueWithRelations
		>;

		const makeRow = (queue: QueueWithRelations) => ({
			queueNumber: queue.queueNumber,
			serviceType: queue.service.name,
			visitorName: queue.visitor.name,
			phoneNumber: queue.visitor.phone,
			createdAt: format(new Date(queue.createdAt), "yyyy-MM-dd HH:mm:ss"),
			startTime: queue.startTime
				? format(new Date(queue.startTime), "yyyy-MM-dd HH:mm:ss")
				: "",
			endTime: queue.endTime
				? format(new Date(queue.endTime), "yyyy-MM-dd HH:mm:ss")
				: "",
			status: queue.status,
			servedBy: queue.admin ? queue.admin.name : "",
			waitTimeMinutes: queue.startTime
				? Math.round(
						(new Date(queue.startTime).getTime() -
							new Date(queue.createdAt).getTime()) /
							(1000 * 60)
				  )
				: "",
			serviceTimeMinutes:
				queue.startTime && queue.endTime
					? Math.round(
							(new Date(queue.endTime).getTime() -
								new Date(queue.startTime).getTime()) /
								(1000 * 60)
					  )
					: "",
		});

		const pageSize = 500;
		const encoder = new TextEncoder();

		async function* fetchQueueBatches() {
			let cursor: { id: string } | undefined = undefined;
			let hasMore = true;
			while (hasMore) {
				const batch: QueueWithRelations[] = await prisma.queue.findMany({
					...queueWithRelations,
					where: {
						createdAt: {
							gte: startDate,
							lt: endDate,
						},
					},
					include: {
						visitor: true,
						service: true,
						admin: true,
					},
					orderBy: [
						{ createdAt: "asc" },
						{ id: "asc" },
					],
					take: pageSize,
					cursor: cursor ? { id: cursor.id } : undefined,
					skip: cursor ? 1 : 0,
				});

				if (batch.length === 0) {
					break;
				}

				yield batch.map(makeRow);

				if (batch.length < pageSize) {
					hasMore = false;
					continue;
				}

				cursor = { id: batch[batch.length - 1].id };
			}
		}

		if (exportFormat === "json") {
			const stream = new ReadableStream({
				async start(controller) {
					controller.enqueue(encoder.encode("["));
					let isFirst = true;
					for await (const rows of fetchQueueBatches()) {
						for (const row of rows) {
							const prefix = isFirst ? "" : ",";
							isFirst = false;
							controller.enqueue(
								encoder.encode(`${prefix}${JSON.stringify(row)}`)
							);
						}
					}
					controller.enqueue(encoder.encode("]"));
					controller.close();
				},
			});

			return new NextResponse(stream, {
				headers: {
					"Content-Type": "application/json",
				},
			});
		} else if (exportFormat === "csv") {
			let headersWritten = false;
			const stream = new ReadableStream({
				async start(controller) {
					for await (const rows of fetchQueueBatches()) {
						if (rows.length === 0) continue;
						if (!headersWritten) {
							const headers = Object.keys(rows[0]).join(",") + "\n";
							controller.enqueue(encoder.encode(headers));
							headersWritten = true;
						}

						for (const row of rows) {
							const headers = Object.keys(row);
							const values = headers.map((header) => {
								const value = row[header as keyof typeof row];
								return typeof value === "string"
									? `"${value.replace(/"/g, '""')}"`
									: value;
							});
							controller.enqueue(encoder.encode(values.join(",") + "\n"));
						}
					}
					controller.close();
				},
			});

			return new NextResponse(stream, {
				headers: {
					"Content-Type": "text/csv",
					"Content-Disposition": `attachment; filename="pst-queue-report-${format(
						new Date(),
						"yyyy-MM-dd"
					)}.csv"`,
				},
			});
		}

		return NextResponse.json(
			{ error: "Unsupported export format" },
			{ status: 400 }
		);
	} catch (error) {
		console.error("Error exporting analytics data:", error);
		return NextResponse.json(
			{ error: "Failed to export analytics data" },
			{ status: 500 }
		);
	}
}
