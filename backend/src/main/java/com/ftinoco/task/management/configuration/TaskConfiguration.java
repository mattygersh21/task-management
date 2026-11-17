package com.ftinoco.task.management.configuration;

import org.modelmapper.ModelMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;



@Configuration
public class TaskConfiguration {

    @Bean
    ModelMapper modelMapperBean() {
        return new ModelMapper();
	} 
}