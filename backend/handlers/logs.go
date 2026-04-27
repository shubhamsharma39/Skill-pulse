package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/trainwithshubham/skillpulse/database"
	"github.com/trainwithshubham/skillpulse/models"
)

func CreateLog(c *gin.Context) {
	skillID := c.Param("id")

	// Verify skill exists
	var exists bool
	err := database.DB.QueryRow("SELECT EXISTS(SELECT 1 FROM skills WHERE id = ?)", skillID).Scan(&exists)
	if err != nil || !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Skill not found"})
		return
	}

	var req models.CreateLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := database.DB.Exec(
		"INSERT INTO learning_logs (skill_id, hours, notes, log_date) VALUES (?, ?, ?, ?)",
		skillID, req.Hours, req.Notes, req.LogDate,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	id, _ := result.LastInsertId()
	c.JSON(http.StatusCreated, gin.H{"id": id, "message": "Learning session logged"})
}

type RecentLog struct {
	models.LearningLog
	SkillName string `json:"skill_name"`
}

func GetRecentLogs(c *gin.Context) {
	rows, err := database.DB.Query(`
		SELECT l.id, l.skill_id, l.hours, l.notes, l.log_date, l.created_at, s.name as skill_name
		FROM learning_logs l
		JOIN skills s ON l.skill_id = s.id
		ORDER BY l.log_date DESC, l.created_at DESC
		LIMIT 20
	`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	logs := []RecentLog{}
	for rows.Next() {
		var l RecentLog
		if err := rows.Scan(&l.ID, &l.SkillID, &l.Hours, &l.Notes, &l.LogDate, &l.CreatedAt, &l.SkillName); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		logs = append(logs, l)
	}

	c.JSON(http.StatusOK, logs)
}
