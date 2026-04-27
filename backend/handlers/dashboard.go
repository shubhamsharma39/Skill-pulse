package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/trainwithshubham/skillpulse/database"
	"github.com/trainwithshubham/skillpulse/models"
)

func GetDashboard(c *gin.Context) {
	var dash models.Dashboard

	database.DB.QueryRow("SELECT COUNT(*) FROM skills").Scan(&dash.TotalSkills)
	database.DB.QueryRow("SELECT COALESCE(SUM(hours), 0) FROM learning_logs").Scan(&dash.TotalHours)
	database.DB.QueryRow("SELECT COUNT(*) FROM learning_logs").Scan(&dash.TotalLogs)

	err := database.DB.QueryRow(`
		SELECT s.name FROM skills s
		LEFT JOIN learning_logs l ON s.id = l.skill_id
		GROUP BY s.id, s.name
		ORDER BY COALESCE(SUM(l.hours), 0) DESC
		LIMIT 1
	`).Scan(&dash.TopSkill)
	if err != nil {
		dash.TopSkill = "N/A"
	}

	// Calculate Streak
	rows, err := database.DB.Query("SELECT DISTINCT log_date FROM learning_logs ORDER BY log_date DESC")
	streak := 0
	if err == nil {
		defer rows.Close()
		var dates []string
		for rows.Next() {
			var d string
			if err := rows.Scan(&d); err == nil {
				dates = append(dates, d)
			}
		}
		
		if len(dates) > 0 {
			streak = 1
			for i := 1; i < len(dates); i++ {
				t1, _ := time.Parse("2006-01-02", dates[i-1])
				t2, _ := time.Parse("2006-01-02", dates[i])
				if t1.Sub(t2).Hours() <= 24 {
					streak++
				} else {
					break
				}
			}
		}
	}
	dash.CurrentStreak = streak

	// Calculate Weekly Activity (Last 7 Days)
	dash.WeeklyActivity = make(map[string]float64)
	for i := 0; i < 7; i++ {
		date := time.Now().AddDate(0, 0, -i).Format("2006-01-02")
		dash.WeeklyActivity[date] = 0
	}

	rows, err = database.DB.Query("SELECT log_date, SUM(hours) FROM learning_logs WHERE log_date >= ? GROUP BY log_date", time.Now().AddDate(0, 0, -6).Format("2006-01-02"))
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var d string
			var h float64
			if err := rows.Scan(&d, &h); err == nil {
				dash.WeeklyActivity[d] = h
			}
		}
	}

	c.JSON(http.StatusOK, dash)
}

func HealthCheck(c *gin.Context) {
	err := database.DB.Ping()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy", "error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}
