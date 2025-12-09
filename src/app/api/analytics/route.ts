import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; // Updated import path
import { format } from "date-fns";
import prisma from "@/lib/prisma"; // Import shared prisma instance
import { QueueStatus } from "@/generated/prisma"; // Add this import

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
		const maxRangeDays = 31;

		// Parse the start date
		const startDate = new Date(startDateParam); // parseISO works with YYYY-MM-DD format
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
					error: `Rentang tanggal terlalu besar. Maksimal ${maxRangeDays} hari.`,
				},
				{ status: 400 }
			);
		}

		// Get all queues within the date range
		const queues = await prisma.queue.findMany({
			where: {
				createdAt: {
					gte: startDate,
					lt: endDate,
				},
			},
			select: {
				status: true,
				queueType: true,
				serviceId: true,
				createdAt: true,
				startTime: true,
				endTime: true,
				admin: {
					select: {
						id: true,
						name: true,
					},
				},
			},
		});

		// Calculate summary statistics
		const totalVisitors = queues.length;
		const completedServices = queues.filter(
			(q) => q.status === QueueStatus.COMPLETED
		).length;
		const canceledServices = queues.filter(
			(q) => q.status === QueueStatus.CANCELED
		).length;

		// Calculate average wait and service times
		let totalWaitTimeMs = 0;
		let totalServiceTimeMs = 0;
		let waitCount = 0;
		let serviceCount = 0;

		queues.forEach((queue) => {
			if (queue.startTime) {
				// Wait time: time from creation to start of service
				const waitTimeMs =
					new Date(queue.startTime).getTime() -
					new Date(queue.createdAt).getTime();
				totalWaitTimeMs += waitTimeMs;
				waitCount++;

				// Service time: time from start to completion of service
				if (queue.endTime && queue.status === QueueStatus.COMPLETED) {
					const serviceTimeMs =
						new Date(queue.endTime).getTime() -
						new Date(queue.startTime).getTime();
					totalServiceTimeMs += serviceTimeMs;
					serviceCount++;
				}
			}
		});

		const averageWaitTimeMinutes =
			waitCount > 0 ? Math.round(totalWaitTimeMs / waitCount / (1000 * 60)) : 0;

		const averageServiceTimeMinutes =
			serviceCount > 0
				? Math.round(totalServiceTimeMs / serviceCount / (1000 * 60))
				: 0;

		// Generate service distribution data
		const serviceTypes = await prisma.service.findMany();

		const serviceDistribution = serviceTypes
			.map((serviceType) => {
				const count = queues.filter(
					(q) => q.serviceId === serviceType.id
				).length;
				const percentage =
					totalVisitors > 0 ? Math.round((count / totalVisitors) * 100) : 0;

				return {
					name: serviceType.name,
					count,
					percentage,
				};
			})
			.filter((item) => item.count > 0);

		// Generate queue type distribution data
		const onlineCount = queues.filter((q) => q.queueType === "ONLINE").length;
		const offlineCount = queues.filter((q) => q.queueType === "OFFLINE").length;

		const queueTypeDistribution = [
			{
				name: "Online",
				count: onlineCount,
				percentage:
					totalVisitors > 0
						? Math.round((onlineCount / totalVisitors) * 100)
						: 0,
			},
			{
				name: "Offline",
				count: offlineCount,
				percentage:
					totalVisitors > 0
						? Math.round((offlineCount / totalVisitors) * 100)
						: 0,
			},
		].filter((item) => item.count > 0);

		// Generate admin performance data
		const admins = await prisma.user.findMany({
			where: {
				queues: {
					some: {
						createdAt: {
							gte: startDate,
							lt: endDate,
						},
					},
				},
			},
		});

		const adminPerformance = admins
			.map((admin) => {
				const adminQueues = queues.filter(
					(q) => q.admin && q.admin.id === admin.id
				);
				const completedCount = adminQueues.filter(
					(q) => q.status === QueueStatus.COMPLETED
				).length;

				let totalAdminServiceTimeMs = 0;
				let adminServiceCount = 0;

				adminQueues.forEach((queue) => {
					if (
						queue.startTime &&
						queue.endTime &&
						queue.status === QueueStatus.COMPLETED
					) {
						const serviceTimeMs =
							new Date(queue.endTime).getTime() -
							new Date(queue.startTime).getTime();
						totalAdminServiceTimeMs += serviceTimeMs;
						adminServiceCount++;
					}
				});

				const averageServiceTime =
					adminServiceCount > 0
						? Math.round(
								totalAdminServiceTimeMs / adminServiceCount / (1000 * 60)
						  )
						: 0;

				return {
					adminName: admin.name,
					completedCount,
					averageServiceTime,
				};
			})
			.filter((item) => item.completedCount > 0);

		// Time analysis - count queues by hour of day
		const timeAnalysis = Array.from({ length: 24 }, (_, i) => ({
			hourOfDay: i,
			count: 0,
		}));

		queues.forEach((queue) => {
			const hour = new Date(queue.createdAt).getHours();
			timeAnalysis[hour].count += 1;
		});

		// Filter out hours with no visitors
		const filteredTimeAnalysis = timeAnalysis.filter((item) => item.count > 0);

		// Daily trends - count queues by day and status
		const dailyMap = new Map();

		queues.forEach((queue) => {
			const day = format(new Date(queue.createdAt), "yyyy-MM-dd");

			if (!dailyMap.has(day)) {
				dailyMap.set(day, {
					date: day,
					waiting: 0,
					completed: 0,
					canceled: 0,
				});
			}

			const dayData = dailyMap.get(day);

			switch (queue.status) {
				case QueueStatus.WAITING:
					dayData.waiting += 1;
					break;
				case QueueStatus.SERVING:
					dayData.waiting += 1; // Count serving as waiting for simplicity
					break;
				case QueueStatus.COMPLETED:
					dayData.completed += 1;
					break;
				case QueueStatus.CANCELED:
					dayData.canceled += 1;
					break;
			}
		});

		const dailyTrends = Array.from(dailyMap.values()).sort((a, b) => {
			return new Date(a.date).getTime() - new Date(b.date).getTime();
		});
		return NextResponse.json({
			summary: {
				totalVisitors,
				completedServices,
				canceledServices,
				averageWaitTimeMinutes,
				averageServiceTimeMinutes,
			},
			serviceDistribution,
			queueTypeDistribution,
			adminPerformance,
			timeAnalysis: filteredTimeAnalysis,
			dailyTrends,
		});
	} catch (error) {
		console.error("Error fetching analytics data", error);
		return NextResponse.json(
			{ error: "Failed to fetch analytics data" },
			{ status: 500 }
		);
	}
}
